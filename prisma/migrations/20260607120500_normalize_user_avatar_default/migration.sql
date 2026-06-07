ALTER TABLE "User" ALTER COLUMN "avatar" SET DEFAULT '/chibi/1.png';

UPDATE "User"
SET "avatar" = '/chibi/1.png'
WHERE "avatar" IS NULL
   OR "avatar" = '1.png'
   OR "avatar" = 'http://localhost:3000/1.png';
