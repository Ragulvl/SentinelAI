// pdfmake is a CommonJS package — require() directly in CJS context
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake/build/pdfmake') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfFonts    = require('pdfmake/build/vfs_fonts') as any;
PdfPrinter.vfs   = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {};


import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';

function makePrinter() {
  return new PdfPrinter({
    Roboto: {
      normal:      pdfFonts.pdfMake?.vfs['Roboto-Regular.ttf']      ? 'Roboto-Regular.ttf'      : Buffer.from(''),
      bold:        pdfFonts.pdfMake?.vfs['Roboto-Medium.ttf']       ? 'Roboto-Medium.ttf'       : Buffer.from(''),
      italics:     pdfFonts.pdfMake?.vfs['Roboto-Italic.ttf']      ? 'Roboto-Italic.ttf'       : Buffer.from(''),
      bolditalics: pdfFonts.pdfMake?.vfs['Roboto-MediumItalic.ttf']? 'Roboto-MediumItalic.ttf' : Buffer.from(''),
    },
  });
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high:     '#EA580C',
  medium:   '#D97706',
  low:      '#16A34A',
};

const SEVERITY_BG: Record<string, string> = {
  critical: '#FEE2E2',
  high:     '#FED7AA',
  medium:   '#FEF3C7',
  low:      '#D1FAE5',
};

function severityBadge(sev: string): Content {
  return {
    text: sev.toUpperCase(),
    fontSize: 7,
    bold: true,
    color: SEVERITY_COLORS[sev] ?? '#6B7280',
    background: SEVERITY_BG[sev] ?? '#F3F4F6',
  };
}

function sectionHeader(text: string): Content {
  return {
    text,
    fontSize: 14,
    bold: true,
    color: '#1F2937',
    margin: [0, 16, 0, 6],
    decoration: 'underline',
    decorationColor: '#39FF14',
  } as Content;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Scan PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function generateScanReportPdf(scan: any): Promise<Buffer> {
  const printer = makePrinter();

  const vulns: any[] = scan.vulnerabilities ?? [];
  const cves: any[]  = scan.cveResults ?? [];
  const summary      = scan.summary ?? {};

  const vulnRows: Content[][] = vulns.map((v: any) => [
    severityBadge(v.severity),
    { text: v.title,       fontSize: 8 },
    { text: v.file,        fontSize: 7, color: '#6B7280' },
    { text: v.cweId || '—', fontSize: 7 },
    { text: v.fixAvailable ? '✓' : '✗', fontSize: 8, color: v.fixAvailable ? '#16A34A' : '#DC2626' },
  ]);

  const cveRows: Content[][] = cves.map((c: any) => [
    severityBadge(c.severity),
    { text: c.pkg,    fontSize: 8 },
    { text: c.version, fontSize: 8 },
    { text: c.cveId,  fontSize: 7, color: '#2563EB' },
    { text: c.fixedIn ?? '—', fontSize: 7, color: '#16A34A' },
  ]);

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    background: [{ canvas: [{ type: 'rect', x: 0, y: 0, w: 595, h: 842, color: '#0D0D0D' }] }],

    content: [
      // Header
      { text: '🛡️ SentinelAI', fontSize: 24, bold: true, color: '#39FF14', margin: [0, 0, 0, 4] },
      { text: 'Code Security Report', fontSize: 16, color: '#9CA3AF', margin: [0, 0, 0, 4] },
      { text: `Generated: ${new Date().toLocaleString()}`, fontSize: 9, color: '#6B7280', margin: [0, 0, 0, 20] },

      // Repository info
      sectionHeader('Repository'),
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: 'Repository', bold: true, fontSize: 9, color: '#9CA3AF' }, { text: scan.repoFullName, fontSize: 9, color: '#F9FAFB' }],
            [{ text: 'Branch', bold: true, fontSize: 9, color: '#9CA3AF' }, { text: scan.defaultBranch, fontSize: 9, color: '#F9FAFB' }],
            [{ text: 'Scan Date', bold: true, fontSize: 9, color: '#9CA3AF' }, { text: new Date(scan.completedAt ?? scan.updatedAt).toLocaleString(), fontSize: 9, color: '#F9FAFB' }],
            [{ text: 'Status', bold: true, fontSize: 9, color: '#9CA3AF' }, { text: scan.status.toUpperCase(), fontSize: 9, color: '#39FF14' }],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 16],
      } as Content,

      // Summary
      sectionHeader('Executive Summary'),
      {
        columns: [
          { text: `${summary.critical ?? 0}`, fontSize: 28, bold: true, color: '#DC2626', alignment: 'center' },
          { text: `${summary.high ?? 0}`,     fontSize: 28, bold: true, color: '#EA580C', alignment: 'center' },
          { text: `${summary.medium ?? 0}`,   fontSize: 28, bold: true, color: '#D97706', alignment: 'center' },
          { text: `${summary.low ?? 0}`,      fontSize: 28, bold: true, color: '#16A34A', alignment: 'center' },
          { text: `${cves.length}`,           fontSize: 28, bold: true, color: '#2563EB', alignment: 'center' },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        columns: [
          { text: 'CRITICAL', fontSize: 8, color: '#DC2626', alignment: 'center' },
          { text: 'HIGH',     fontSize: 8, color: '#EA580C', alignment: 'center' },
          { text: 'MEDIUM',   fontSize: 8, color: '#D97706', alignment: 'center' },
          { text: 'LOW',      fontSize: 8, color: '#16A34A', alignment: 'center' },
          { text: 'CVEs',     fontSize: 8, color: '#2563EB', alignment: 'center' },
        ],
        margin: [0, 0, 0, 20],
      },

      // Vulnerabilities table
      ...(vulns.length > 0 ? [
        sectionHeader(`Code Vulnerabilities (${vulns.length})`),
        {
          table: {
            headerRows: 1,
            widths: [55, '*', 120, 60, 30],
            body: [
              [
                { text: 'Severity', bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Title',    bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'File',     bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'CWE',      bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Fix',      bold: true, fontSize: 8, color: '#9CA3AF' },
              ],
              ...vulnRows,
            ],
          },
          layout: { hLineColor: () => '#374151', vLineColor: () => '#374151' },
          margin: [0, 0, 0, 16],
        } as Content,
      ] : [{ text: '✓ No code vulnerabilities found.', color: '#16A34A', margin: [0, 0, 0, 16] } as Content]),

      // CVE table
      ...(cves.length > 0 ? [
        sectionHeader(`Dependency CVEs (${cves.length})`),
        {
          table: {
            headerRows: 1,
            widths: [55, '*', 55, 90, 70],
            body: [
              [
                { text: 'Severity', bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Package',  bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Version',  bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'CVE ID',   bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Fixed In', bold: true, fontSize: 8, color: '#9CA3AF' },
              ],
              ...cveRows,
            ],
          },
          layout: { hLineColor: () => '#374151', vLineColor: () => '#374151' },
          margin: [0, 0, 0, 16],
        } as Content,
      ] : [{ text: '✓ No dependency CVEs found.', color: '#16A34A', margin: [0, 0, 0, 16] } as Content]),

      // Top fix recommendations
      ...(vulns.filter((v: any) => v.fixAvailable).length > 0 ? [
        sectionHeader('Top Fix Recommendations'),
        ...vulns
          .filter((v: any) => v.fixAvailable && (v.severity === 'critical' || v.severity === 'high'))
          .slice(0, 5)
          .map((v: any) => ({
            stack: [
              { text: v.title, bold: true, fontSize: 9, color: '#F9FAFB', margin: [0, 8, 0, 2] },
              { text: v.description, fontSize: 8, color: '#9CA3AF', margin: [0, 0, 0, 4] },
              ...(v.patchedCode ? [{ text: v.patchedCode.slice(0, 300), fontSize: 7, font: 'Courier', background: '#111827', color: '#39FF14', margin: [4, 2, 4, 2] }] : []),
            ],
          } as Content)),
      ] : []),

      // Footer
      { text: '\nGenerated by SentinelAI Security Platform · sentinalsec.vercel.app', fontSize: 8, color: '#4B5563', alignment: 'center', margin: [0, 20, 0, 0] },
    ],

    defaultStyle: { font: 'Roboto', color: '#F9FAFB' },
    styles: {},
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (e) { reject(e); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pentest PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePentestReportPdf(pentest: any): Promise<Buffer> {
  const printer = makePrinter();

  const findings: any[] = pentest.results?.vulnerabilities ?? pentest.vulnerabilities ?? [];
  const passed: any[]   = pentest.results?.passed ?? pentest.passed ?? [];

  const findingRows: Content[][] = findings.map((f: any) => [
    severityBadge(f.severity ?? f.risk ?? 'low'),
    { text: f.name ?? f.title ?? f.type ?? '—',  fontSize: 8 },
    { text: f.description?.slice(0, 120) ?? '—', fontSize: 7, color: '#9CA3AF' },
    { text: f.endpoint ?? f.url ?? '—',          fontSize: 7, color: '#6B7280' },
  ]);

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    background: [{ canvas: [{ type: 'rect', x: 0, y: 0, w: 595, h: 842, color: '#0D0D0D' }] }],

    content: [
      { text: '🛡️ SentinelAI', fontSize: 24, bold: true, color: '#39FF14', margin: [0, 0, 0, 4] },
      { text: 'Penetration Test Report', fontSize: 16, color: '#9CA3AF', margin: [0, 0, 0, 4] },
      { text: `Generated: ${new Date().toLocaleString()}`, fontSize: 9, color: '#6B7280', margin: [0, 0, 0, 20] },

      sectionHeader('Target'),
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: 'URL',       bold: true, fontSize: 9, color: '#9CA3AF' }, { text: pentest.url ?? '—',    fontSize: 9, color: '#F9FAFB' }],
            [{ text: 'Test Date', bold: true, fontSize: 9, color: '#9CA3AF' }, { text: new Date(pentest.completedAt ?? pentest.updatedAt ?? Date.now()).toLocaleString(), fontSize: 9, color: '#F9FAFB' }],
            [{ text: 'Status',    bold: true, fontSize: 9, color: '#9CA3AF' }, { text: pentest.status?.toUpperCase() ?? 'COMPLETED', fontSize: 9, color: '#39FF14' }],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 16],
      } as Content,

      sectionHeader('Executive Summary'),
      {
        columns: [
          { text: `${findings.length}`, fontSize: 32, bold: true, color: '#DC2626', alignment: 'center' },
          { text: `${passed.length}`,   fontSize: 32, bold: true, color: '#16A34A', alignment: 'center' },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        columns: [
          { text: 'VULNERABILITIES FOUND', fontSize: 8, color: '#DC2626', alignment: 'center' },
          { text: 'TESTS PASSED',          fontSize: 8, color: '#16A34A', alignment: 'center' },
        ],
        margin: [0, 0, 0, 20],
      },

      ...(findings.length > 0 ? [
        sectionHeader(`Findings (${findings.length})`),
        {
          table: {
            headerRows: 1,
            widths: [55, 120, '*', 80],
            body: [
              [
                { text: 'Severity',     bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Name',         bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Description',  bold: true, fontSize: 8, color: '#9CA3AF' },
                { text: 'Endpoint',     bold: true, fontSize: 8, color: '#9CA3AF' },
              ],
              ...findingRows,
            ],
          },
          layout: { hLineColor: () => '#374151', vLineColor: () => '#374151' },
          margin: [0, 0, 0, 16],
        } as Content,
      ] : [{ text: '✓ No vulnerabilities found.', color: '#16A34A', margin: [0, 0, 0, 16] } as Content]),

      { text: '\nGenerated by SentinelAI Security Platform · sentinalsec.vercel.app', fontSize: 8, color: '#4B5563', alignment: 'center', margin: [0, 20, 0, 0] },
    ],
    defaultStyle: { font: 'Roboto', color: '#F9FAFB' },
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (e) { reject(e); }
  });
}
