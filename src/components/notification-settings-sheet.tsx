"use client";

import React, { useState, useEffect } from 'react';
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { BellRing, Clock } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast';

export interface NotificationSettings {
  enabled: boolean;
  frequency: number; // minutes
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export const defaultSettings: NotificationSettings = {
  enabled: false,
  frequency: 60, // Default to every 60 minutes
  startTime: '09:00', // Default start time 9 AM
  endTime: '21:00', // Default end time 9 PM
};

// Placeholder for notification scheduling logic
let notificationInterval: NodeJS.Timeout | null = null;

const scheduleNotifications = (settings: NotificationSettings, toast: ReturnType<typeof useToast>['toast']) => {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }

  if (!settings.enabled || typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'denied') {
    console.warn('通知權限已被拒絕。');
    return;
  }

  if (Notification.permission === 'default') {
     // Request permission if not granted or denied
     Notification.requestPermission().then(permission => {
         if (permission === 'granted') {
             console.log('通知權限已授予。');
             scheduleNotifications(settings, toast); // Reschedule with granted permission
         } else {
             console.warn('通知權限未授予。');
         }
     });
     return; // Don't schedule yet, wait for permission result
  }

  // Permission is granted, proceed with scheduling
  console.log(`排程通知：每 ${settings.frequency} 分鐘，從 ${settings.startTime} 到 ${settings.endTime}`);

  notificationInterval = setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    const [startHour, startMinute] = settings.startTime.split(':').map(Number);
    const [endHour, endMinute] = settings.endTime.split(':').map(Number);

    let isWithinTimeRange = false;
    if (startHour < endHour || (startHour === endHour && startMinute <= endMinute)) {
      // Simple case: start time is before end time on the same day
      isWithinTimeRange =
        currentTimeStr >= settings.startTime && currentTimeStr <= settings.endTime;
    } else {
      // Complex case: time range crosses midnight (e.g., 22:00 to 06:00)
      isWithinTimeRange =
        currentTimeStr >= settings.startTime || currentTimeStr <= settings.endTime;
    }

    if (isWithinTimeRange) {
       console.log("觸發通知...");
       try {
            new Notification("喝水提醒！", {
               body: "是時候補充水分了！",
               icon: "/icons/water-drop.png", // Optional: Add an icon path
               tag: "water-reminder", // Tag to prevent multiple similar notifications
               renotify: true, // Allow re-notification even if tag matches
           });
       } catch (e) {
           console.error("顯示通知時發生錯誤:", e);
       }
    } else {
        console.log("目前時間不在通知範圍內。");
    }
  }, settings.frequency * 60 * 1000); // Convert frequency from minutes to milliseconds
};


export function NotificationSettingsSheet() {
  const [settings, setSettings, settingsError] = useLocalStorage<NotificationSettings>('notificationSettings', defaultSettings);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Effect to handle initial permission request and scheduling on load
  useEffect(() => {
    if (!isClient || !settings.enabled) return;

    if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
            // Ask for permission gently on load if enabled but permission not set
            // Maybe add a small button/prompt instead of automatic request?
            // For now, let's just log it. Re-request happens on save.
            console.log("通知權限尚未設定。儲存設定時將要求權限。");
        } else {
            // Schedule if permission is already granted
            scheduleNotifications(settings, toast);
        }
    }

    // Cleanup interval on component unmount or when settings disable notifications
    return () => {
      if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
         console.log("已清除通知排程。");
      }
    };
  }, [settings, isClient, toast]); // Rerun if settings change


   const handleSettingChange = <K extends keyof NotificationSettings>(
     key: K,
     value: NotificationSettings[K]
   ) => {
      // Prevent updates on server
      if (!isClient) return;

      // Input validation for frequency
      if (key === 'frequency') {
          const numValue = Number(value);
          if (isNaN(numValue) || numValue < 1) {
              // Optionally show a toast or validation message
              toast({ title: "無效的頻率", description: "頻率必須至少為 1 分鐘。", variant: "destructive"});
              return; // Prevent setting invalid frequency
          }
          value = numValue as NotificationSettings[K]; // Ensure correct type after validation
      }

      // Input validation for time format (basic)
      if ((key === 'startTime' || key === 'endTime') && typeof value === 'string') {
          if (!/^\d{2}:\d{2}$/.test(value)) {
             toast({ title: "無效的時間格式", description: "時間格式應為 HH:mm。", variant: "destructive"});
             return;
          }
          // Further validation could check if hours/minutes are valid
          const [hours, minutes] = value.split(':').map(Number);
          if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
             toast({ title: "無效的時間", description: "請輸入有效的小時 (00-23) 和分鐘 (00-59)。", variant: "destructive"});
             return;
          }
      }


      setSettings((prev) => ({ ...prev, [key]: value }));
   };

   const handleSaveSettings = async () => {
        // Request permission if needed when saving and enabling notifications
        if (settings.enabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                toast({
                    title: "通知權限未授予",
                    description: "如要接收喝水提醒，請允許通知。",
                    variant: "destructive"
                });
                // Optionally disable the setting if permission denied?
                // setSettings(prev => ({ ...prev, enabled: false }));
                // For now, just warn.
            } else {
                 toast({ title: "通知權限已授予", description: "喝水提醒已設定。" });
                 // Reschedule immediately after permission granted on save
                 scheduleNotifications(settings, toast);
            }
        } else if (settings.enabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
             // Reschedule if already granted and settings changed
             scheduleNotifications(settings, toast);
             toast({ title: "通知設定已儲存", description: "喝水提醒已更新。" });
        } else if (!settings.enabled) {
             // Clear schedule if disabled
             if (notificationInterval) {
                 clearInterval(notificationInterval);
                 notificationInterval = null;
             }
             toast({ title: "通知設定已儲存", description: "喝水提醒已停用。" });
        }

        // Close the sheet - SheetClose is used below for the button
   }


  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <BellRing size={20} /> 通知設定
        </SheetTitle>
        <SheetDescription>
          設定喝水提醒通知。您的設定將儲存在此瀏覽器中。
          {settingsError && <span className="text-destructive ml-1">({settingsError.message})</span>}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-6 py-6">
        {/* Enable/Disable Switch */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <Label htmlFor="notifications-enabled" className="flex flex-col space-y-1">
            <span>啟用喝水提醒</span>
            <span className="font-normal leading-snug text-muted-foreground">
              開啟以接收定期喝水通知。
            </span>
          </Label>
          <Switch
            id="notifications-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
            disabled={!isClient} // Disable on server
            aria-label="啟用喝水提醒"
          />
        </div>

        {/* Settings only shown when enabled */}
        {settings.enabled && (
          <>
            {/* Frequency Input */}
            <div className="grid gap-2">
               <Label htmlFor="notifications-frequency" className="flex items-center gap-1"><Clock size={14}/> 提醒頻率 (分鐘)</Label>
               <Input
                 id="notifications-frequency"
                 type="number"
                 value={settings.frequency}
                 onChange={(e) => handleSettingChange('frequency', e.target.value)}
                 min="1" // Minimum frequency of 1 minute
                 step="15" // Suggest steps of 15 minutes
                 placeholder="例如：60"
                 disabled={!isClient}
                 aria-label="設定提醒頻率（分鐘）"
               />
            </div>

            {/* Time Range Inputs */}
            <div className="grid grid-cols-2 gap-4">
               <div className="grid gap-2">
                 <Label htmlFor="notifications-start-time">開始時間</Label>
                 <Input
                   id="notifications-start-time"
                   type="time"
                   value={settings.startTime}
                   onChange={(e) => handleSettingChange('startTime', e.target.value)}
                   disabled={!isClient}
                   aria-label="設定提醒開始時間"
                 />
               </div>
               <div className="grid gap-2">
                 <Label htmlFor="notifications-end-time">結束時間</Label>
                 <Input
                   id="notifications-end-time"
                   type="time"
                   value={settings.endTime}
                   onChange={(e) => handleSettingChange('endTime', e.target.value)}
                   disabled={!isClient}
                   aria-label="設定提醒結束時間"
                 />
               </div>
            </div>
             {/* Notification Permission Status/Action */}
             {isClient && typeof window !== 'undefined' && 'Notification' in window && (
                 <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50">
                     {Notification.permission === 'granted' && "通知權限：已授予"}
                     {Notification.permission === 'denied' && <span className="text-destructive">通知權限：已拒絕 (請至瀏覽器設定修改)</span>}
                     {Notification.permission === 'default' && "通知權限：尚未要求"}
                 </div>
             )}
          </>
        )}
      </div>

      <SheetFooter>
        <SheetClose asChild>
          <Button type="button" variant="outline">取消</Button>
        </SheetClose>
        <SheetClose asChild>
         <Button type="button" onClick={handleSaveSettings} disabled={!isClient}>儲存設定</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}
