import { z } from 'zod'
import { APP_MODES, APP_ROLES } from './roles'

export const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase())

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number')

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, { error: 'Accept the terms to continue' }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

export const profileSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1).max(100),
  email: emailSchema,
  locale: z.enum(['en', 'bn']),
  activeMode: z.enum(APP_MODES),
  roles: z.array(z.enum(APP_ROLES)).min(1),
})

export const inviteAdminSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(100),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type Profile = z.infer<typeof profileSchema>
export type InviteAdminInput = z.infer<typeof inviteAdminSchema>
