ALTER TABLE staff ADD CONSTRAINT chk_staff_status CHECK (status IN ('ACTIVE','INACTIVE'));
CREATE TRIGGER trg_staff_no_delete BEFORE DELETE ON staff
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();
