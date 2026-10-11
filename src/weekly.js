// Báo cáo tuần: file Word đầy đủ + email.
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType, PageBreak, Footer, PageNumber } = require('docx');
const config = require('./config');
const { q, getSettings } = require('./db');
const ai = require('./ai');
const { ymd, viDate, addDays } = require('./util');

const FONT = 'Times New Roman';

function lastWeekRange(today = ymd()) {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  const thisMonday = addDays(today, -dow);
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

// Chuyển văn bản (có **đậm**) thành các đoạn docx
function paras(text, opts = {}) {
  return String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
    const isHead = /^#{1,3}\s/.test(line);
    const clean = line.replace(/^#{1,3}\s/, '').replace(/^[-*•]\s+/, '• ');
    const runs = clean.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(part => new TextRun({
      text: part.replace(/\*\*/g, ''), bold: isHead || /^\*\*.*\*\*$/.test(part), font: FONT, size: opts.size || 26,
    }));
    return new Paragraph({ children: runs, spacing: { after: 120, line: 300 }, alignment: AlignmentType.JUSTIFIED });
  });
}

function h(text, level) { return new Paragraph({ heading: level, children: [new TextRun({ text, font: FONT, bold: true })], spacing: { before: 240, after: 120 } }); }

async function buildWeeklyDocx(from, to) {
  const arts = await q("SELECT * FROM articles WHERE status = 'done' AND brief_date BETWEEN ? AND ? ORDER BY brief_date, relevance DESC", [from, to]);
  arts.forEach(a => { a.key_figures = typeof a.key_figures === 'string' ? JSON.parse(a.key_figures || '[]') : (a.key_figures || []); });
  const label = `${viDate(from)} – ${viDate(to)}`;
  let overview = '';
  if (arts.length) { try { overview = await ai.weeklyOverview(label, arts); } catch (e) { overview = `(Không tạo được tổng quan tự động: ${e.message})`; } }
  const dailies = await q("SELECT * FROM digests WHERE kind = 'daily' AND brief_date BETWEEN ? AND ? ORDER BY brief_date", [from, to]);

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'BẢN TIN TUẦN', bold: true, size: 36, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Na Uy – Bắc Âu – Việt Nam – ASEAN', size: 28, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: `Tuần ${label} · ${arts.length} tin`, italics: true, size: 24, font: FONT })] }),
    h('I. TỔNG QUAN TUẦN', HeadingLevel.HEADING_1), ...paras(overview || 'Không có tin trong tuần.'),
    h('II. TỔNG HỢP TIN TỪNG NGÀY', HeadingLevel.HEADING_1),
  ];
  dailies.forEach(d => { children.push(h(`Ngày ${viDate(d.brief_date)}`, HeadingLevel.HEADING_2), ...paras(d.content_vi)); });
  children.push(new Paragraph({ children: [new PageBreak()] }), h('III. TOÀN VĂN CÁC TIN, BÀI', HeadingLevel.HEADING_1));

  arts.forEach((a, i) => {
    children.push(
      h(`${i + 1}. ${a.title_vi || a.title_original}`, HeadingLevel.HEADING_2),
      new Paragraph({ children: [new TextRun({ text: `Nguyên văn tiêu đề: ${a.title_original}`, italics: true, font: FONT, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: `Nguồn: ${a.source_name} · ${a.published_at || viDate(a.brief_date)}${a.full_text ? '' : ' · (chỉ phần công khai)'}`, font: FONT, size: 22 })] }),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Link bài gốc: ', font: FONT, size: 22 }), new ExternalHyperlink({ link: a.url, children: [new TextRun({ text: a.url, style: 'Hyperlink', font: FONT, size: 22 })] })] }),
      h('Tin A', HeadingLevel.HEADING_3), ...paras(a.tin_a_vi),
    );
    if (a.key_figures.length) {
      children.push(h('Số liệu đáng chú ý', HeadingLevel.HEADING_3));
      a.key_figures.forEach(f => children.push(...paras(`• ${f.figure} – ${f.context} (Nguồn: ${f.source}${f.type ? '; ' + f.type : ''})`, { size: 24 })));
    }
    children.push(h('Bản dịch tiếng Việt', HeadingLevel.HEADING_3), ...paras(a.translation_vi, { size: 24 }));
    children.push(h('Nguyên văn', HeadingLevel.HEADING_3), ...paras(a.content_original, { size: 22 }));
  });

  const doc = new Document({
    creator: 'NewsBrief',
    title: `Bản tin tuần ${label}`,
    styles: { default: { document: { run: { font: FONT, size: 26 } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
      children,
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  return { buffer, label, count: arts.length, overview, filename: `BanTinTuan_${from}_${to}.docx` };
}

async function sendWeekly(range) {
  const settings = await getSettings();
  const { from, to } = range || lastWeekRange();
  const rep = await buildWeeklyDocx(from, to);
  if (!config.smtp.user || !config.smtp.pass) throw new Error('Chưa cấu hình SMTP_USER/SMTP_PASSWORD');
  const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass } });
  const to_ = settings.weekly_to || config.weeklyTo;
  await transport.sendMail({
    from: config.smtp.from || config.smtp.user,
    to: to_,
    subject: `[NewsBrief] Bản tin tuần ${rep.label} (${rep.count} tin)`,
    text: `Kính gửi,\n\nĐính kèm bản tin tuần ${rep.label} gồm ${rep.count} tin, bài (tổng quan, tổng hợp từng ngày, tin A, số liệu, bản dịch và nguyên văn kèm link bài gốc).\n\n${rep.overview.slice(0, 3000)}\n\n— NewsBrief${config.publicUrl ? ' · ' + config.publicUrl : ''}`,
    attachments: [{ filename: rep.filename, content: rep.buffer }],
  });
  await q("INSERT INTO digests (kind, date_from, date_to, content_vi) VALUES ('weekly', ?, ?, ?)", [from, to, rep.overview || '']);
  return { sentTo: to_, ...rep, buffer: undefined };
}

module.exports = { buildWeeklyDocx, sendWeekly, lastWeekRange };
