
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

export const UserProfileDisplay: React.FC = () => {
  const { user, logout, loading } = useAuth();

  if (loading) {
      // Show skeleton loaders while loading auth state
      return (
          <div className="flex items-center justify-between w-full border p-3 rounded-lg bg-muted/50">
             <div className="flex items-center gap-3">
                 <Skeleton className="h-10 w-10 rounded-full" />
                 <div className="space-y-1">
                     <Skeleton className="h-4 w-32" />
                     <Skeleton className="h-3 w-40" />
                 </div>
             </div>
             <Skeleton className="h-9 w-24" />
         </div>
      );
  }

  if (!user) {
    // This component shouldn't be rendered if the user is not logged in,
    // but handle it just in case.
    return null;
  }

  const getInitials = (name: string | null | undefined) => {
      if (!name) return '';
      return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  return (
    <div className="flex items-center justify-between w-full border p-3 rounded-lg bg-muted/50 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
          <AvatarFallback>
            {user.displayName ? getInitials(user.displayName) : <UserIcon size={18} />}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium text-foreground">{user.displayName || '使用者'}</p>
          <p className="text-xs text-muted-foreground">{user.email || '無 Email'}</p>
        </div>
      </div>
      <Button onClick={logout} variant="ghost" size="sm" disabled={loading}>
        <LogOut className="mr-2 h-4 w-4" />
        登出
      </Button>
    </div>
  );
};
