-- Administrative complaint closure is NOT evidence of payment or receipt.
-- Existing workflow/refund states are deliberately left unchanged.
ALTER TABLE return_requests ADD COLUMN case_completed_at TEXT;
ALTER TABLE return_requests ADD COLUMN case_completed_by TEXT;
ALTER TABLE return_requests ADD COLUMN case_completion_reason TEXT;

CREATE TRIGGER return_case_completion_valid BEFORE UPDATE ON return_requests
WHEN OLD.case_completed_at IS NULL AND NEW.case_completed_at IS NOT NULL
 AND (length(trim(COALESCE(NEW.case_completed_by,'')))=0
 OR length(trim(COALESCE(NEW.case_completion_reason,''))) NOT BETWEEN 10 AND 1000)
BEGIN SELECT RAISE(ABORT,'Complaint completion requires an admin and a reason'); END;

CREATE TRIGGER return_case_completion_immutable BEFORE UPDATE ON return_requests
WHEN OLD.case_completed_at IS NOT NULL AND
 (NEW.case_completed_at IS NOT OLD.case_completed_at
 OR NEW.case_completed_by IS NOT OLD.case_completed_by
 OR NEW.case_completion_reason IS NOT OLD.case_completion_reason)
BEGIN SELECT RAISE(ABORT,'Complaint completion evidence cannot be replaced'); END;
