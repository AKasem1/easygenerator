import type { SignInInput, SignUpInput } from '@shared';

import { apiClient } from '@/shared/api/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export async function signUpRequest(input: SignUpInput): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/sign-up', input);
  return response.data;
}

export async function signInRequest(input: SignInInput): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/sign-in', input);
  return response.data;
}

export async function signOutRequest(): Promise<void> {
  await apiClient.post('/auth/sign-out');
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/users/me');
  return response.data;
}
