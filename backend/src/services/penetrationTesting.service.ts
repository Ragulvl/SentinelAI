/**
 * Backward-compatibility shim.
 * The original penetrationTesting.service.ts now simply re-exports from the new modular structure.
 * All existing imports like:
 *   import { PenetrationTestingService } from '../services/penetrationTesting.service.js'
 * continue to work without any changes.
 */
export { PenetrationTestingService } from './pentest/orchestrator.js';
export type {
  PenetrationTestResult,
  PenetrationTestReport,
  PentestProgressEvent,
  AttackChain,
  TechStack,
  ScanCredentials,
  AttackSurface,
} from './pentest/types.js';
