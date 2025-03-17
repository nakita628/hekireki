import { describe, expect, it } from "vitest";
import { groupByModelHelper } from "./group-by-model-helper";

const groupByModelHelperTestCases = [
	{
		validFields: [
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "id",
				comment: [
					"Unique identifier for the user",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "name",
				comment: ["User's display name", "@v.string()"],
				validation: "string()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "username",
				comment: [
					"Unique username for the user",
					"@v.pipe(v.string(), v.minLength(3), v.maxLength(20))",
				],
				validation: "string().min(3).max(20)",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "bio",
				comment: [
					"User's biography or profile description",
					'@v.optional(v.string(), "")',
				],
				validation: 'string().optional().default("")',
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "email",
				comment: [
					"User's unique email address",
					"@v.pipe(v.string(), v.email())",
				],
				validation: "string().email()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "emailVerified",
				comment: ["Timestamp of email verification", "@v.optional(v.date())"],
				validation: "date().optional()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "image",
				comment: [
					"URL of user's image",
					"@v.optional(v.pipe(v.string(), v.url()))",
				],
				validation: "string().url().optional()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "coverImage",
				comment: [
					"URL of user's cover image",
					"@v.optional(v.pipe(v.string(), v.url()))",
				],
				validation: "string().url().optional()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "profileImage",
				comment: [
					"URL of user's profile image",
					"@v.optional(v.pipe(v.string(), v.url()))",
				],
				validation: "string().url().optional()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "hashedPassword",
				comment: [
					"Hashed password for security",
					"@v.optional(v.pipe(v.string(), v.minLength(8), v.maxLength(20)))",
				],
				validation: "string().min(8).max(20).optional()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "createdAt",
				comment: ["Timestamp when the user was created", "@v.date()"],
				validation: "date()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "updatedAt",
				comment: ["Timestamp when the user was last updated", "@v.date()"],
				validation: "date()",
			},
			{
				documentation:
					"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
				modelName: "User",
				fieldName: "hasNotification",
				comment: [
					"Flag indicating if user has unread notifications",
					"@v.optional(v.boolean(), false)",
				],
				validation: "boolean().default(false)",
			},
			{
				documentation: "",
				modelName: "Post",
				fieldName: "id",
				comment: [
					"Unique identifier for the post",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Post",
				fieldName: "body",
				comment: [
					"Content of the post",
					"@v.pipe(v.string(), v.minLength(1), v.maxLength(1000))",
				],
				validation: "string().min(1).max(1000)",
			},
			{
				documentation: "",
				modelName: "Post",
				fieldName: "createdAt",
				comment: ["Timestamp when the post was created", "@v.date()"],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "Post",
				fieldName: "updatedAt",
				comment: ["Timestamp when the post was last updated", "@v.date()"],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "Post",
				fieldName: "userId",
				comment: [
					"ID of the user who created the post",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Follow",
				fieldName: "id",
				comment: [
					"Unique identifier for the follow relationship",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Follow",
				fieldName: "followerId",
				comment: [
					"ID of the user who is following",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Follow",
				fieldName: "followingId",
				comment: [
					"ID of the user being followed",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Follow",
				fieldName: "createdAt",
				comment: [
					"Timestamp when the follow relationship was created",
					"@v.date()",
				],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "Like",
				fieldName: "id",
				comment: [
					"Unique identifier for the like",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Like",
				fieldName: "userId",
				comment: [
					"ID of the user who liked the post",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Like",
				fieldName: "postId",
				comment: [
					"ID of the post that was liked",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Like",
				fieldName: "createdAt",
				comment: ["Timestamp when the like was created", "@v.date()"],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "Comment",
				fieldName: "id",
				comment: [
					"Unique identifier for the comment",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Comment",
				fieldName: "body",
				comment: [
					"Content of the comment",
					"@v.pipe(v.string(), v.minLength(1), v.maxLength(1000))",
				],
				validation: "string().min(1).max(1000)",
			},
			{
				documentation: "",
				modelName: "Comment",
				fieldName: "createdAt",
				comment: ["Timestamp when the comment was created", "@v.date()"],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "Comment",
				fieldName: "updatedAt",
				comment: ["Timestamp when the comment was last updated"],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "Comment",
				fieldName: "userId",
				comment: [
					"ID of the user who created the comment",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Comment",
				fieldName: "postId",
				comment: [
					"ID of the post this comment belongs to",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Notification",
				fieldName: "id",
				comment: [
					"Unique identifier for the notification",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Notification",
				fieldName: "body",
				comment: [
					"Content of the notification message",
					"@v.pipe(v.string(), v.minLength(1), v.maxLength(1000))",
				],
				validation: "string().min(1).max(1000)",
			},
			{
				documentation: "",
				modelName: "Notification",
				fieldName: "userId",
				comment: [
					"ID of the user who receives the notification",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "Notification",
				fieldName: "createdAt",
				comment: ["Timestamp when the notification was created", "@v.date()"],
				validation: "date()",
			},
		],
		expected: {
			User: [
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "id",
					comment: [
						"Unique identifier for the user",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "name",
					comment: ["User's display name", "@v.string()"],
					validation: "string()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "username",
					comment: [
						"Unique username for the user",
						"@v.pipe(v.string(), v.minLength(3), v.maxLength(20))",
					],
					validation: "string().min(3).max(20)",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "bio",
					comment: [
						"User's biography or profile description",
						'@v.optional(v.string(), "")',
					],
					validation: 'string().optional().default("")',
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "email",
					comment: [
						"User's unique email address",
						"@v.pipe(v.string(), v.email())",
					],
					validation: "string().email()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "emailVerified",
					comment: ["Timestamp of email verification", "@v.optional(v.date())"],
					validation: "date().optional()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "image",
					comment: [
						"URL of user's image",
						"@v.optional(v.pipe(v.string(), v.url()))",
					],
					validation: "string().url().optional()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "coverImage",
					comment: [
						"URL of user's cover image",
						"@v.optional(v.pipe(v.string(), v.url()))",
					],
					validation: "string().url().optional()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "profileImage",
					comment: [
						"URL of user's profile image",
						"@v.optional(v.pipe(v.string(), v.url()))",
					],
					validation: "string().url().optional()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "hashedPassword",
					comment: [
						"Hashed password for security",
						"@v.optional(v.pipe(v.string(), v.minLength(8), v.maxLength(20)))",
					],
					validation: "string().min(8).max(20).optional()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "createdAt",
					comment: ["Timestamp when the user was created", "@v.date()"],
					validation: "date()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "updatedAt",
					comment: ["Timestamp when the user was last updated", "@v.date()"],
					validation: "date()",
				},
				{
					documentation:
						"@r User.id Post.userId one-to-many\n@r User.id Comment.userId one-to-many\n@r User.id Notification.userId one-to-many\n@r User.id Follow.followerId one-to-many\n@r User.id Follow.followingId one-to-many\n@r User.id Like.userId one-to-many",
					modelName: "User",
					fieldName: "hasNotification",
					comment: [
						"Flag indicating if user has unread notifications",
						"@v.optional(v.boolean(), false)",
					],
					validation: "boolean().default(false)",
				},
			],
			Post: [
				{
					documentation: "",
					modelName: "Post",
					fieldName: "id",
					comment: [
						"Unique identifier for the post",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Post",
					fieldName: "body",
					comment: [
						"Content of the post",
						"@v.pipe(v.string(), v.minLength(1), v.maxLength(1000))",
					],
					validation: "string().min(1).max(1000)",
				},
				{
					documentation: "",
					modelName: "Post",
					fieldName: "createdAt",
					comment: ["Timestamp when the post was created", "@v.date()"],
					validation: "date()",
				},
				{
					documentation: "",
					modelName: "Post",
					fieldName: "updatedAt",
					comment: ["Timestamp when the post was last updated", "@v.date()"],
					validation: "date()",
				},
				{
					documentation: "",
					modelName: "Post",
					fieldName: "userId",
					comment: [
						"ID of the user who created the post",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
			],
			Follow: [
				{
					documentation: "",
					modelName: "Follow",
					fieldName: "id",
					comment: [
						"Unique identifier for the follow relationship",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Follow",
					fieldName: "followerId",
					comment: [
						"ID of the user who is following",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Follow",
					fieldName: "followingId",
					comment: [
						"ID of the user being followed",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Follow",
					fieldName: "createdAt",
					comment: [
						"Timestamp when the follow relationship was created",
						"@v.date()",
					],
					validation: "date()",
				},
			],
			Like: [
				{
					documentation: "",
					modelName: "Like",
					fieldName: "id",
					comment: [
						"Unique identifier for the like",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Like",
					fieldName: "userId",
					comment: [
						"ID of the user who liked the post",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Like",
					fieldName: "postId",
					comment: [
						"ID of the post that was liked",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Like",
					fieldName: "createdAt",
					comment: ["Timestamp when the like was created", "@v.date()"],
					validation: "date()",
				},
			],
			Comment: [
				{
					documentation: "",
					modelName: "Comment",
					fieldName: "id",
					comment: [
						"Unique identifier for the comment",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Comment",
					fieldName: "body",
					comment: [
						"Content of the comment",
						"@v.pipe(v.string(), v.minLength(1), v.maxLength(1000))",
					],
					validation: "string().min(1).max(1000)",
				},
				{
					documentation: "",
					modelName: "Comment",
					fieldName: "createdAt",
					comment: ["Timestamp when the comment was created", "@v.date()"],
					validation: "date()",
				},
				{
					documentation: "",
					modelName: "Comment",
					fieldName: "updatedAt",
					comment: ["Timestamp when the comment was last updated"],
					validation: "date()",
				},
				{
					documentation: "",
					modelName: "Comment",
					fieldName: "userId",
					comment: [
						"ID of the user who created the comment",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Comment",
					fieldName: "postId",
					comment: [
						"ID of the post this comment belongs to",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
			],
			Notification: [
				{
					documentation: "",
					modelName: "Notification",
					fieldName: "id",
					comment: [
						"Unique identifier for the notification",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Notification",
					fieldName: "body",
					comment: [
						"Content of the notification message",
						"@v.pipe(v.string(), v.minLength(1), v.maxLength(1000))",
					],
					validation: "string().min(1).max(1000)",
				},
				{
					documentation: "",
					modelName: "Notification",
					fieldName: "userId",
					comment: [
						"ID of the user who receives the notification",
						"@v.pipe(v.string(), v.uuid())",
					],
					validation: "string().uuid()",
				},
				{
					documentation: "",
					modelName: "Notification",
					fieldName: "createdAt",
					comment: ["Timestamp when the notification was created", "@v.date()"],
					validation: "date()",
				},
			],
		},
	},
];

describe("groupByModelHelper", () => {
	it.concurrent.each(groupByModelHelperTestCases)(
		"groupByModelHelper($validFields) -> $expected",
		({ validFields, expected }) => {
			const result = groupByModelHelper(validFields);
			expect(result).toEqual(expected);
		},
	);
});
