
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export const LoginButton: React.FC = () => {
  const { signInWithGoogle, loading } = useAuth();

  return (
    <Button onClick={signInWithGoogle} disabled={loading} className="w-full">
      <LogIn className="mr-2 h-4 w-4" />
      使用 Google 登入
    </Button>
  );
};
