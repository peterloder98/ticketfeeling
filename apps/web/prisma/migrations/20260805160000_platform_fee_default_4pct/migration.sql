-- Bump default Verwaltungsgebühr from 3% (300 bps) to 4% (400 bps).
-- Only updates orgs still on the previous seeded default (300) or empty config.
-- Orgs that intentionally set a different percentage are left unchanged.
-- Existing orders keep their snapshotted fee % — this affects new orders only.

UPDATE "organization_settings"
SET "platform_fee_config" = jsonb_build_object(
  'enabled', true,
  'percentageBasisPoints', 400,
  'displayName', COALESCE("platform_fee_config"->>'displayName', 'Verwaltungsgebühr'),
  'calculationBase', COALESCE(
    "platform_fee_config"->>'calculationBase',
    'ticket_subtotal_after_discounts'
  ),
  'taxMode', COALESCE("platform_fee_config"->>'taxMode', 'inherit_ticket_tax_rate'),
  'customTaxRateBasisPoints', "platform_fee_config"->'customTaxRateBasisPoints',
  'customerDescription',
    'Die Verwaltungsgebühr unterstützt den sicheren Betrieb, die Zahlungsabwicklung, die Ticketbereitstellung und unseren persönlichen Kundenservice. Mit 4 % bleibt Ticketfeeling bewusst deutlich unter den Gebühren vieler klassischer Ticketanbieter.',
  'activeFrom', "platform_fee_config"->'activeFrom',
  'version', GREATEST(
    COALESCE(("platform_fee_config"->>'version')::int, 1) + 1,
    2
  )
)
WHERE
  "platform_fee_config" IS NULL
  OR "platform_fee_config" = '{}'::jsonb
  OR COALESCE(("platform_fee_config"->>'percentageBasisPoints')::int, 300) = 300;
