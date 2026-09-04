import { Router, Request, Response } from 'express';
import { ScanController } from '../controllers/scan.controller.js';
import { Scan } from '../db/models/Scan.model.js';
import { generateScanReportPdf } from '../services/pdfReport.service.js';

const router = Router();

// Start a new scan
router.post('/start', ScanController.startScan);

// Get scan status (with logs)
router.get('/:scanId/status', ScanController.getScanStatus);

// Get scan results (vulnerabilities)
router.get('/:scanId/results', ScanController.getScanResults);

// Get user's scan history
router.get('/history', ScanController.getUserScans);

// Create PR with fixes
router.post('/:scanId/create-pr', ScanController.createFixPR);

// Download fixed files as ZIP
router.get('/:scanId/download', ScanController.downloadFixedFiles);

// Get file content
router.get('/:scanId/file/*filePath', ScanController.getFileContent);

// Update file content
router.put('/:scanId/file/*filePath', ScanController.updateFileContent);

// Download PDF report
router.get('/:scanId/report.pdf', async (req: Request, res: Response) => {
  try {
    const scan = await Scan.findById(req.params.scanId).lean();
    if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
    const pdfBuffer = await generateScanReportPdf(scan);
    const filename = `sentinelai-scan-${scan.repoName ?? 'report'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
