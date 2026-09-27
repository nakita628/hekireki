-- Rows written under the before schema, each of them in the way of the after schema somewhere.
INSERT INTO "User" ("id", "email", "fullName", "role", "age", "nickname", "createdAt") VALUES
  (1, 'ada@example.com', 'Ada Lovelace', 'admin', '36', 'ada', '2024-01-01T00:00:00.000+00:00'),
  (2, 'bob@example.com', 'Bob Smith', 'member', ' 41 ', NULL, '2024-02-01T00:00:00.000+00:00'),
  (3, 'bob@example.com', 'Bob Smith (again)', 'member', '', 'bobby', '2024-03-01T00:00:00.000+00:00'),
  (4, 'cy@example.com', 'Cy Young', 'member', NULL, NULL, '2024-04-01T00:00:00.000+00:00');
INSERT INTO "Post" ("id", "title", "status", "authorId") VALUES
  (1, 'Hello', 'published', 1),
  (2, 'Draft', 'draft', 1),
  (3, 'Old news', 'archived', 2),
  (4, 'Nobody wrote this', 'published', NULL);
