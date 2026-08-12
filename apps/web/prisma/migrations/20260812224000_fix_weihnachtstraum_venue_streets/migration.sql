-- Fix Weihnachtstraum venue streets (avoid "Name · Name, PLZ City" when street == name).
UPDATE "locations"
SET
  "name" = 'Bürgerhaus Löwenberg',
  "street" = 'Am Waldstadion',
  "house_number" = '6',
  "postal_code" = '16775',
  "city" = 'Löwenberger Land',
  "country" = 'DE',
  "description" = 'Bürgerhaus Löwenberg, Am Waldstadion 6, 16775 Löwenberger Land, Deutschland.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'buergerhaus-loewenberg';

UPDATE "locations"
SET
  "name" = 'Bürgersaal Ergolding',
  "street" = 'Lindenstraße',
  "house_number" = '40',
  "postal_code" = '84030',
  "city" = 'Ergolding',
  "country" = 'DE',
  "description" = 'Bürgersaal Ergolding, Lindenstraße 40, 84030 Ergolding, Deutschland.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'buergersaal-ergolding';

UPDATE "locations"
SET
  "name" = 'Kent Club',
  "street" = 'Stresemannstraße',
  "house_number" = '163',
  "postal_code" = '22769',
  "city" = 'Hamburg',
  "country" = 'DE',
  "description" = 'Kent Club, Stresemannstraße 163, 22769 Hamburg, Deutschland.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'kent-club-hamburg';
