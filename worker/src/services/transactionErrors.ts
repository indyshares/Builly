export type TransactionErrorCode =
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'LOCK_TIMEOUT'
  | 'LOCK_OWNERSHIP_LOST'
  | 'DRIVE_TRANSIENT_ERROR'
  | 'DRIVE_PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'DUPLICATE_RESOURCE_CANDIDATES'
  | 'PARENT_MISMATCH'
  | 'POSTCONDITION_FAILED'
  | 'NEEDS_RECONCILIATION'
  | 'PROJECTION_REPAIR_PENDING'
  | 'WRITE_DISABLED_OAUTH_UNAVAILABLE'
  | 'FORBIDDEN_SPREADSHEET_ACCESS';

export interface SafeErrorDetails {
  resourceId?: string;
  expectedRevision?: number;
  actualRevision?: number;
  candidates?: Array<{ id: string; name?: string; parents?: string[] }>;
  parentId?: string;
  expectedParentId?: string;
  needsReconciliation?: boolean;
}

export class BuillyTransactionError extends Error {
  code: TransactionErrorCode;
  status: number;
  retryable: boolean;
  operationId?: string;
  details?: SafeErrorDetails;

  constructor(
    code: TransactionErrorCode,
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
      operationId?: string;
      details?: SafeErrorDetails;
    }
  ) {
    super(message);
    this.name = 'BuillyTransactionError';
    this.code = code;
    this.status = options?.status ?? defaultStatusForCode(code);
    this.retryable = options?.retryable ?? defaultRetryableForCode(code);
    this.operationId = options?.operationId;
    this.details = options?.details;
  }

  toSafeJson(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
      ...(this.operationId ? { operationId: this.operationId } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

function defaultStatusForCode(code: TransactionErrorCode): number {
  switch (code) {
    case 'REVISION_CONFLICT':
    case 'IDEMPOTENCY_KEY_REUSED':
    case 'LOCK_OWNERSHIP_LOST':
    case 'DUPLICATE_RESOURCE_CANDIDATES':
    case 'PARENT_MISMATCH':
    case 'NEEDS_RECONCILIATION':
      return 409;
    case 'LOCK_TIMEOUT':
      return 423;
    case 'DRIVE_PERMISSION_DENIED':
    case 'FORBIDDEN_SPREADSHEET_ACCESS':
      return 403;
    case 'RESOURCE_NOT_FOUND':
      return 404;
    case 'DRIVE_TRANSIENT_ERROR':
    case 'WRITE_DISABLED_OAUTH_UNAVAILABLE':
      return 503;
    case 'POSTCONDITION_FAILED':
      return 502;
    case 'PROJECTION_REPAIR_PENDING':
      return 202;
  }
}

function defaultRetryableForCode(code: TransactionErrorCode): boolean {
  return (
    code === 'LOCK_TIMEOUT' ||
    code === 'DRIVE_TRANSIENT_ERROR' ||
    code === 'PROJECTION_REPAIR_PENDING'
  );
}
