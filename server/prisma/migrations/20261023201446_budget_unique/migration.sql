-- Keep the earliest budget for each user/category/month before enforcing uniqueness.
DELETE FROM "Budget" b
USING "Budget" d
WHERE b."userId" = d."userId"
  AND b."category" = d."category"
  AND b."yearMonth" = d."yearMonth"
  AND (b."createdAt" > d."createdAt" OR (b."createdAt" = d."createdAt" AND b."id" > d."id"));

CREATE UNIQUE INDEX "Budget_userId_category_yearMonth_key" ON "Budget"("userId", "category", "yearMonth");
