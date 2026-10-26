-- Método de pago externo por campaña (enlace de pago y/o transferencia SPEI)
-- y eventos de clic/vista del método de pago. Aplica después de 001.
BEGIN;
ALTER TABLE campaign
  ADD COLUMN payment_link_url text,
  ADD COLUMN transfer_bank text CHECK (transfer_bank IS NULL OR char_length(transfer_bank) BETWEEN 2 AND 80),
  ADD COLUMN transfer_holder text CHECK (transfer_holder IS NULL OR char_length(transfer_holder) BETWEEN 2 AND 120),
  ADD COLUMN transfer_clabe text CHECK (transfer_clabe IS NULL OR transfer_clabe ~ '^[0-9]{18}$'),
  ADD COLUMN transfer_reference text CHECK (transfer_reference IS NULL OR char_length(transfer_reference) <= 60),
  ADD CONSTRAINT campaign_payment_link_https CHECK (
    payment_link_url IS NULL OR (payment_link_url ~ '^https://' AND char_length(payment_link_url) <= 500)
  ),
  ADD CONSTRAINT campaign_transfer_complete CHECK (
    (transfer_clabe IS NULL AND transfer_bank IS NULL AND transfer_holder IS NULL AND transfer_reference IS NULL)
    OR (transfer_clabe IS NOT NULL AND transfer_bank IS NOT NULL AND transfer_holder IS NOT NULL)
  );
ALTER TABLE visit_event DROP CONSTRAINT visit_event_event_type_check,
  ADD CONSTRAINT visit_event_event_type_check
    CHECK (event_type IN ('view', 'click', 'pay_link', 'pay_transfer'));
ALTER TABLE metric_bucket DROP CONSTRAINT metric_bucket_event_type_check,
  ADD CONSTRAINT metric_bucket_event_type_check
    CHECK (event_type IN ('view', 'click', 'donation', 'pay_link', 'pay_transfer'));
COMMIT;
