
"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  Camera,
  UtensilsCrossed,
  Droplet,
  User,
  Plus,
  Edit,
  Trash2,
  Bell,
  BarChart,
  ZoomIn,
  X,
  UploadCloud,
  RotateCw,
  MapPin,
  Clock,
  DollarSign,
  Info,
  Settings,
  Apple
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/loading-spinner';
import { estimateCalorieCount, EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count';
import useLocalStorage, { LocalStorageError } from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast';
import { isValidDate, cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog'; // Import Dialog components
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Sheet, SheetTrigger } from '@/components/ui/sheet'; // Import Sheet components
import { NotificationSettingsSheet, NotificationSettings, defaultSettings as defaultNotificationSettings } from '@/components/notification-settings-sheet'; // Import the new sheet component
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export interface CalorieLogEntry {
  id: string; // Unique ID for each entry
  foodItem: string;
  calorieEstimate: number;
  imageUrl: string | null; // Can be null if no image or during loading
  timestamp: string; // ISO string format
  mealType: MealType | null;
  location: string | null;
  cost: number | null;
  notes?: string; // Optional user notes
  confidence?: number; // AI confidence score (0-1)
}

export interface UserProfile {
  age: number | null;
  gender: 'male' | 'female' | 'other' | null;
  height: number | null; // cm
  weight: number | null; // kg
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive' | null;
}

const activityLevelMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

// Translations for activity levels
const activityLevelTranslations: Record<string, string> = {
  sedentary: "久坐 (很少或沒有運動)",
  light: "輕度活動 (每週運動 1-3 天)",
  moderate: "中度活動 (每週運動 3-5 天)",
  active: "活躍 (每週運動 6-7 天)",
  veryActive: "非常活躍 (體力要求高的工作或每天運動)",
};

// Translations for meal types
const mealTypeTranslations: Record<string, string> = {
  Breakfast: "早餐",
  Lunch: "午餐",
  Dinner: "晚餐",
  Snack: "點心",
};

// Default User Profile
const defaultUserProfile: UserProfile = {
  age: null,
  gender: null,
  height: null,
  weight: null,
  activityLevel: null,
};

// Helper function to calculate BMR (Harris-Benedict Equation)
const calculateBMR = (profile: UserProfile): number | null => {
  if (!profile.weight || !profile.height || !profile.age || !profile.gender) {
    return null;
  }

  if (profile.gender === 'male') {
    return 88.362 + (13.397 * profile.weight) + (4.799 * profile.height) - (5.677 * profile.age);
  } else if (profile.gender === 'female') {
    return 447.593 + (9.247 * profile.weight) + (3.098 * profile.height) - (4.330 * profile.age);
  }
  // Consider 'other' gender calculation or return null/average
  return null; // Or handle 'other' case appropriately
};

// Helper function to calculate Daily Calorie Needs (BMR * Activity Level)
const calculateDailyCalories = (profile: UserProfile): number | null => {
  const bmr = calculateBMR(profile);
  if (!bmr || !profile.activityLevel) {
    return null;
  }
  const multiplier = activityLevelMultipliers[profile.activityLevel];
  return bmr * multiplier;
};

// Helper function to calculate BMI
const calculateBMI = (profile: UserProfile): number | null => {
  if (!profile.weight || !profile.height) {
    return null;
  }
  const heightInMeters = profile.height / 100;
  return profile.weight / (heightInMeters * heightInMeters);
};

// Helper function to calculate Recommended Water Intake (simple version)
// Example: 35ml per kg of body weight (adjust as needed)
const calculateRecommendedWater = (profile: UserProfile): number => {
    if (!profile.weight) return 2000; // Default to 2000ml if no weight
    return Math.round(profile.weight * 35);
};

// Function to get current date as YYYY-MM-DD
const getCurrentDate = (): string => {
    return new Date().toISOString().split('T')[0];
};


export default function CalorieLogger() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [estimation, setEstimation] = useState<EstimateCalorieCountOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [calorieLog, setCalorieLog, logError] = useLocalStorage<CalorieLogEntry[]>('calorieLog', []);
  const [userProfile, setUserProfile, profileError] = useLocalStorage<UserProfile>('userProfile', defaultUserProfile);
  const [waterLog, setWaterLog, waterLogError] = useLocalStorage<Record<string, number>>('waterLog', {}); // { 'YYYY-MM-DD': liters }
  const [notificationSettings, setNotificationSettings, notificationSettingsError] = useLocalStorage<NotificationSettings>('notificationSettings', defaultNotificationSettings);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({}); // State to manage details visibility for each log entry
  const [editingEntry, setEditingEntry] = useState<CalorieLogEntry | null>(null); // State for the entry being edited
  const [isEditing, setIsEditing] = useState(false); // State to control the edit dialog
  const [showImageModal, setShowImageModal] = useState<string | null>(null); // State to control the image zoom modal
  const [currentLocation, setCurrentLocation] = useState<string | null>('正在獲取...');
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isCropping, setIsCropping] = useState(false); // State for crop dialog
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined); // Aspect ratio for crop - undefined for free crop
  const [isClient, setIsClient] = useState(false); // State for client-side rendering check


  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true); // Set client to true once component mounts
  }, []);


  const fetchCurrentLocation = useCallback(() => {
      if (typeof window === 'undefined' || !navigator.geolocation) {
          setCurrentLocation("瀏覽器不支援地理位置");
          if (typeof window !== 'undefined') { // Only toast on client
             toast({ variant: 'destructive', title: '錯誤', description: '您的瀏覽器不支援地理位置功能。' });
          }
          return;
      }

      setIsFetchingLocation(true);
      setCurrentLocation('正在獲取...'); // Indicate loading

      navigator.geolocation.getCurrentPosition(
          (position) => {
              const { latitude, longitude } = position.coords;
              // Basic location string - consider using a geocoding API for address
              setCurrentLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
              setIsFetchingLocation(false);
              toast({ title: '成功', description: '已取得目前位置。' });
          },
          (geoError) => {
              // Log specific error details only if it's not a permission denied error
              if (geoError.code !== geoError.PERMISSION_DENIED) {
                console.error(`取得地點時發生錯誤: ${geoError.message || 'No message'} (代碼: ${geoError.code || 'No code'})`, geoError);
              }

              let description = "無法取得您的地點。";
              if (geoError.code === geoError.PERMISSION_DENIED) {
                  description = "地點權限遭拒。請在瀏覽器設定中啟用。";
              } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
                  description = "地點資訊目前無法使用。";
              } else if (geoError.code === geoError.TIMEOUT) {
                  description = "取得地點超時。";
              }
              setCurrentLocation(description); // Display error message
              setIsFetchingLocation(false);
              toast({ variant: 'destructive', title: '地點錯誤', description });
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options
      );
  }, [toast]);


  // Fetch location on initial client mount
  useEffect(() => {
      if (isClient) {
          fetchCurrentLocation();
      }
  }, [fetchCurrentLocation, isClient]); // Depend on isClient


  useEffect(() => {
      const getCameraPermission = async () => {
          if (typeof window !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
              try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                  setHasCameraPermission(true);
                  if (videoRef.current) {
                      videoRef.current.srcObject = stream;
                  }
                  // Ensure location is fetched after camera is ready (optional, depends on UX flow)
                  // fetchCurrentLocation();
              } catch (error) {
                  console.error('存取相機時發生錯誤:', error);
                  setHasCameraPermission(false);
                  toast({
                      variant: 'destructive',
                      title: '相機存取遭拒',
                      description: '請在您的瀏覽器設定中啟用相機權限以使用此應用程式。',
                  });
                  setCurrentLocation("相機權限遭拒，無法取得位置"); // Indicate location blocked by camera denial
              }
          } else {
              setHasCameraPermission(false);
              if (typeof window !== 'undefined') { // Only set location/log/toast on client
                  setCurrentLocation("不支援媒體裝置");
                  console.warn('此瀏覽器不支援 getUserMedia。');
                  toast({
                      variant: 'destructive',
                      title: '不支援相機',
                      description: '您的瀏覽器不支援相機存取。請嘗試使用其他瀏覽器。',
                  });
              }
          }
      };
      if (isClient) {
         getCameraPermission();
      }


      // Cleanup function to stop video stream when component unmounts
      return () => {
          if (videoRef.current && videoRef.current.srcObject) {
              try {
                 const stream = videoRef.current.srcObject as MediaStream;
                 const tracks = stream.getTracks();
                 tracks.forEach(track => track.stop());
                 videoRef.current.srcObject = null;
              } catch (e) {
                  console.error("清理相機串流時發生錯誤:", e);
              }
          }
      };
  }, [toast, isClient]); // Depend on isClient


  // --- Crop Logic ---

  function centerAspectCrop(
    mediaWidth: number,
    mediaHeight: number,
    aspect: number | undefined, // Allow undefined for free crop
  ) {
      // Default to full image crop
       return centerCrop(
         {
           unit: '%',
           width: 100,
           height: 100,
           x: 0,
           y: 0,
         },
         mediaWidth,
         mediaHeight,
       );

      // Uncomment below if you want aspect ratio locking functionality back
      // if (!aspect) { // If no aspect ratio (free crop), default to full image initially
      //      return centerCrop(
      //        {
      //          unit: '%',
      //          width: 100,
      //          height: 100,
      //          x: 0,
      //          y: 0,
      //        },
      //        mediaWidth,
      //        mediaHeight,
      //      );
      // }
      // // If aspect ratio is defined, use makeAspectCrop
      // return centerCrop(
      //   makeAspectCrop(
      //     {
      //       unit: '%',
      //       width: 90, // Default to 90% width crop when aspect is set
      //     },
      //     aspect,
      //     mediaWidth,
      //     mediaHeight,
      //   ),
      //   mediaWidth,
      //   mediaHeight,
      // );
  }


  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    // Center the crop area, defaulting to full image
    const initialCrop = centerAspectCrop(width, height, undefined); // Always use undefined for full crop initially
    setCrop(initialCrop);
    setCompletedCrop(initialCrop); // Also set completed crop initially
  }


  const getCroppedImg = (image: HTMLImageElement, cropData: Crop, quality: number = 0.2): Promise<string | null> => { // Adjusted default quality to 0.2 (20%)
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const pixelRatio = window.devicePixelRatio || 1; // Consider device pixel ratio for sharpness

     // Ensure crop dimensions are positive
     const cropWidth = Math.max(1, cropData.width);
     const cropHeight = Math.max(1, cropData.height);

     // Calculate canvas dimensions based on crop and pixel ratio
     canvas.width = Math.floor(cropWidth * scaleX * pixelRatio);
     canvas.height = Math.floor(cropHeight * scaleY * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('無法取得 2D 畫布內容');
        return Promise.resolve(null);
    }

     // Scale context for higher resolution drawing
     ctx.scale(pixelRatio, pixelRatio);
     ctx.imageSmoothingQuality = 'high'; // Prefer higher quality smoothing

     // Calculate source and destination crop coordinates
     const sourceX = cropData.x * scaleX;
     const sourceY = cropData.y * scaleY;
     const sourceWidth = cropWidth * scaleX;
     const sourceHeight = cropHeight * scaleY;

     // Destination coordinates on the scaled canvas (always 0,0)
     const destX = 0;
     const destY = 0;
     const destWidth = cropWidth; // Draw at the target crop size (before pixel ratio scaling)
     const destHeight = cropHeight;

    try {
       ctx.drawImage(
           image,
           sourceX,
           sourceY,
           sourceWidth,
           sourceHeight,
           destX,
           destY,
           destWidth,
           destHeight
       );
    } catch (drawError) {
        console.error("繪製影像至畫布時發生錯誤:", drawError);
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        // Use 'image/jpeg' for better compression, use the provided quality
        const base64Image = canvas.toDataURL('image/jpeg', quality);
        if (!base64Image || base64Image === 'data:,') {
             console.error('畫布轉換為 data URL 失敗');
             resolve(null);
        } else {
             resolve(base64Image);
        }
    });
  };

  const handleCropConfirm = async () => {
    if (completedCrop?.width && completedCrop?.height && imgRef.current) {
        setIsLoading(true); // Show loading spinner
        setError(null);
        setEstimation(null); // Clear previous estimation

        try {
            // Use specified quality (0.2 for 20%)
            const croppedDataUrl = await getCroppedImg(imgRef.current, completedCrop, 0.2);
            if (croppedDataUrl) {
                setImageSrc(croppedDataUrl); // Update imageSrc with cropped version
                await handleImageEstimation(croppedDataUrl); // Send cropped image for estimation
            } else {
                setError('無法裁切影像。');
                toast({ variant: 'destructive', title: '錯誤', description: '無法裁切影像。' });
            }
        } catch (e) {
            console.error("裁切影像時發生錯誤:", e);
            setError('裁切影像時發生錯誤。');
            toast({ variant: 'destructive', title: '錯誤', description: '裁切影像時發生錯誤。' });
        } finally {
            setIsLoading(false);
            setIsCropping(false); // Close the crop dialog
        }
    } else {
        toast({ variant: 'destructive', title: '錯誤', description: '無效的裁切區域。請選取一個區域。' });
    }
};


  // --- End Crop Logic ---

  // --- Image Handling & Estimation ---

   const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the image data URL (defaults to PNG, consider JPEG for smaller size)
        // Keep higher quality for cropping source
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9); // Use JPEG with 90% quality initially

        // Set for cropping
        setImageSrc(dataUrl);
        setIsCropping(true);
        setEstimation(null); // Clear previous estimation
        setError(null);

      } else {
        setError("無法取得畫布內容。");
        toast({ variant: 'destructive', title: '錯誤', description: '無法取得畫布內容。' });
      }
    } else {
       setError("視訊或畫布參考無效。");
       toast({ variant: 'destructive', title: '錯誤', description: '視訊或畫布參考無效。' });
    }
  };

   const uploadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Set for cropping
        setImageSrc(dataUrl);
        setIsCropping(true);
        setEstimation(null); // Clear previous estimation
        setError(null);
      };
      reader.onerror = () => {
          setError("讀取檔案時發生錯誤。");
          toast({ variant: 'destructive', title: '錯誤', description: '讀取檔案時發生錯誤。' });
      }
      reader.readAsDataURL(file);
    }
  };


  // Consolidated function to handle estimation after capture or upload (and cropping)
  const handleImageEstimation = async (imageDataUrl: string) => {
      setIsLoading(true);
      setError(null);
      // Keep previous estimation data while loading for editing calories
      // setEstimation(null); // Don't clear estimation immediately

      try {
          console.log("正在估算影像...");
          const result = await estimateCalorieCount({ photoDataUri: imageDataUrl });
          console.log("估算結果:", result);
          setEstimation(result); // Update with new estimation

          // Display warning if not a food item, but allow logging
          if (!result.isFoodItem) {
             toast({
                variant: "orange", // Use the new orange variant if available, or default/warning
                title: "注意：可能不是食物",
                description: `偵測到的項目「${result.foodItem}」可能不是食物。您仍然可以記錄它，但請仔細檢查卡路里。`,
             });
          }

      } catch (e: any) {
          console.error("卡路里估算期間發生錯誤:", e);
          let errorMsg = "卡路里估算失敗。請再試一次。";
          if (e instanceof Error) {
              errorMsg += ` (${e.message})`;
          }
          setError(errorMsg);
          setEstimation(null); // Clear estimation on error
          toast({ variant: 'destructive', title: '估算錯誤', description: errorMsg });
      } finally {
          setIsLoading(false);
      }
  };


  // --- Logging Logic ---

  const logCalories = () => {
    // Allow logging even if only imageSrc exists (before estimation finishes or if it fails)
    if (imageSrc) {
        const currentEstimation = estimation; // Capture current estimation state
        const newEntry: CalorieLogEntry = {
            id: Date.now().toString(), // Simple unique ID
            foodItem: currentEstimation?.foodItem ?? "未辨識", // Default if no estimation
            calorieEstimate: currentEstimation?.isFoodItem ? (currentEstimation.calorieEstimate ?? 0) : 0, // Use 0 if not food or undefined
            imageUrl: imageSrc, // Log the (potentially cropped) image
            timestamp: new Date().toISOString(),
            mealType: null, // User can set this later
            location: currentLocation && currentLocation !== '正在獲取...' && !currentLocation.startsWith('無法') && !currentLocation.startsWith('瀏覽器') ? currentLocation : null, // Log location if available and not an error/loading state
            cost: null,
            confidence: currentEstimation?.isFoodItem ? (currentEstimation.confidence ?? 0) : 0, // Use 0 if not food or undefined
        };

      try {
        // Use the setter function from useLocalStorage
        setCalorieLog(prevLog => {
            // Basic check to prevent excessively large logs
            if (prevLog.length >= 100) { // Example limit: 100 entries
                // Optionally remove the oldest entry
                // return [newEntry, ...prevLog.slice(0, -1)];
                throw new LocalStorageError('記錄已滿，無法新增更多項目。請刪除一些舊記錄。');
            }
            return [newEntry, ...prevLog];
        });


        toast({
          title: "記錄成功",
          description: `${newEntry.foodItem} (${newEntry.calorieEstimate} 卡) 已新增至您的記錄。`,
        });

        // Clear image and estimation after successful logging
        setImageSrc(null);
        setEstimation(null);
        setError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset file input
        }
      } catch (storageError: any) {
         // Handle errors, including the one thrown above
         if (storageError instanceof LocalStorageError) {
             toast({
                 variant: 'destructive',
                 title: '儲存錯誤',
                 description: storageError.message || '無法儲存卡路里記錄。儲存空間可能已滿或發生錯誤。'
             });
         } else {
              toast({
                 variant: 'destructive',
                 title: '儲存錯誤',
                 description: '儲存卡路里記錄時發生未預期的錯誤。'
             });
         }
          // Log the detailed error for debugging
          console.error("儲存記錄時發生錯誤:", storageError);
      }
    } else {
      toast({
        variant: 'destructive',
        title: "記錄失敗",
        description: "沒有影像可記錄。",
      });
    }
  };

  // Allow editing calorie estimate in the estimation result card
  const handleEstimationCalorieChange = (value: string) => {
      if (estimation) {
          const newCalorie = parseInt(value) || 0;
          setEstimation(prev => prev ? { ...prev, calorieEstimate: newCalorie } : null);
      }
  };

  const toggleDetails = (id: string) => {
    setShowDetails(prev => ({ ...prev, [id]: !prev[id] }));
  };


  const startEditing = (entry: CalorieLogEntry) => {
    setEditingEntry({ ...entry }); // Create a copy to edit
    setIsEditing(true);
  };

  const handleEditChange = (field: keyof CalorieLogEntry, value: any) => {
    if (editingEntry) {
      let processedValue = value;
       // Ensure numeric fields are handled correctly
       if (field === 'calorieEstimate') {
           processedValue = value === '' ? 0 : parseInt(value, 10); // Default to 0 if empty or invalid
           if (isNaN(processedValue)) {
               processedValue = 0;
           }
       } else if (field === 'cost') {
           processedValue = value === '' ? null : parseFloat(value);
           if (isNaN(processedValue as number)) {
               processedValue = null;
           }
       }
       // Handle timestamp
       else if (field === 'timestamp' && typeof value === 'string') {
           const date = new Date(value);
           if (isValidDate(date)) {
               processedValue = date.toISOString();
           } else {
               // Keep original timestamp if input is invalid
               processedValue = editingEntry.timestamp;
               toast({ variant: 'destructive', title: '無效日期', description: '請輸入有效的日期和時間。' });
           }
       }
       // Handle meal type selection where empty string means null
       else if (field === 'mealType' && value === '') {
           processedValue = null;
       }

      setEditingEntry(prev => prev ? { ...prev, [field]: processedValue } : null);
    }
  };


  const saveEdit = () => {
    if (editingEntry) {
      try {
        setCalorieLog(prevLog =>
            prevLog.map(entry =>
                entry.id === editingEntry.id ? editingEntry : entry
            )
        );
        toast({ title: "更新成功", description: "記錄項目已更新。" });
        setIsEditing(false);
        setEditingEntry(null);
      } catch (storageError: any) {
          if (storageError instanceof LocalStorageError) {
             toast({ variant: 'destructive', title: '儲存錯誤', description: storageError.message });
          } else {
             toast({ variant: 'destructive', title: '儲存錯誤', description: '儲存更新時發生未預期的錯誤。' });
          }
          console.error("儲存編輯時發生錯誤:", storageError);
      }
    }
  };


  const deleteLogEntry = (id: string) => {
      try {
         setCalorieLog(prevLog => prevLog.filter(entry => entry.id !== id));
         toast({ title: "刪除成功", description: "記錄項目已刪除。" });
      } catch (storageError: any) {
           if (storageError instanceof LocalStorageError) {
              toast({ variant: 'destructive', title: '刪除錯誤', description: storageError.message });
           } else {
              toast({ variant: 'destructive', title: '刪除錯誤', description: '刪除項目時發生未預期的錯誤。' });
           }
           console.error("刪除記錄項目時發生錯誤:", storageError);
      }
  };


  // --- Profile Handling ---

  const handleProfileChange = (field: keyof UserProfile, value: any) => {
      let processedValue = value;
      // Ensure numeric fields are stored as numbers or null
      if (field === 'age' || field === 'height' || field === 'weight') {
          processedValue = value === '' ? null : Number(value);
          if (isNaN(processedValue as number) || processedValue <= 0) { // Add check for non-positive numbers
              processedValue = null; // Handle invalid or non-positive number input
              toast({ variant: 'destructive', title: '無效輸入', description: `${field === 'age' ? '年齡' : field === 'height' ? '身高' : '體重'} 必須是正數。` });
          }
      }
      // Ensure activityLevel is one of the valid keys or null
      if (field === 'activityLevel' && value !== null && !(value in activityLevelMultipliers)) {
          processedValue = null;
      }
      // Ensure gender is one of the valid options or null
      if (field === 'gender' && value !== null && !['male', 'female', 'other'].includes(value)) {
          processedValue = null;
      }

       try {
         setUserProfile(prev => ({ ...prev, [field]: processedValue }));
         // Clear error on successful update attempt (even if value is null)
         // Note: useLocalStorage handles actual storage errors.
       } catch (storageError: any) {
           // This catch block might not be necessary if useLocalStorage handles all errors
           if (storageError instanceof LocalStorageError) {
               toast({ variant: 'destructive', title: '設定檔儲存錯誤', description: storageError.message });
           } else {
               toast({ variant: 'destructive', title: '設定檔儲存錯誤', description: '更新個人資料時發生未預期的錯誤。' });
           }
           console.error("儲存個人資料時發生錯誤:", storageError);
       }
  };

  const bmr = useMemo(() => calculateBMR(userProfile), [userProfile]);
  const dailyCalories = useMemo(() => calculateDailyCalories(userProfile), [userProfile]);
  const bmi = useMemo(() => calculateBMI(userProfile), [userProfile]);
  const recommendedWater = useMemo(() => calculateRecommendedWater(userProfile), [userProfile]);

  // --- Water Tracking ---

  const addWater = (amount: number) => { // amount in ml
    const today = getCurrentDate();
    try {
       setWaterLog(prevLog => ({
           ...prevLog,
           [today]: Math.max(0, (prevLog[today] || 0) + amount), // Ensure water doesn't go below 0
       }));
       toast({ title: "已記錄飲水", description: `已新增 ${amount} 毫升。` });
    } catch (storageError: any) {
        if (storageError instanceof LocalStorageError) {
            toast({ variant: 'destructive', title: '記錄錯誤', description: storageError.message });
        } else {
            toast({ variant: 'destructive', title: '記錄錯誤', description: '記錄飲水時發生未預期的錯誤。' });
        }
         console.error("記錄飲水時發生錯誤:", storageError);
    }
  };

  const resetWater = () => {
      const today = getCurrentDate();
      try {
         setWaterLog(prevLog => ({ ...prevLog, [today]: 0 }));
         toast({ title: "已重設", description: "今日飲水量已重設為 0。" });
      } catch (storageError: any) {
          if (storageError instanceof LocalStorageError) {
            toast({ variant: 'destructive', title: '重設錯誤', description: storageError.message });
         } else {
            toast({ variant: 'destructive', title: '重設錯誤', description: '重設飲水時發生未預期的錯誤。' });
         }
         console.error("重設飲水時發生錯誤:", storageError);
      }
  };

  const todayWaterIntake = isClient ? (waterLog[getCurrentDate()] || 0) : 0; // Guard access
  const waterProgress = recommendedWater ? Math.min((todayWaterIntake / (recommendedWater || 2000)) * 100, 100) : 0; // Use default target if recommended is null
  const defaultWaterTarget = 2000; // Default target if profile is incomplete


  // --- Rendering ---

  const renderLogEntry = (entry: CalorieLogEntry) => (
    <React.Fragment key={entry.id}>
        <Card className="mb-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="p-4">
                <div className="flex items-start space-x-4">
                    {/* Image Thumbnail Button Triggering Modal */}
                    <DialogTrigger asChild>
                         <button
                             className={cn(
                                 "relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-md bg-muted border text-muted-foreground flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity",
                                 !entry.imageUrl && "cursor-default hover:opacity-100" // Disable hover effect if no image
                             )}
                             onClick={(e) => {
                                 if (entry.imageUrl) {
                                     e.stopPropagation();
                                     setShowImageModal(entry.imageUrl);
                                 }
                             }}
                             aria-label={entry.imageUrl ? "放大圖片" : "無圖片"}
                             disabled={!entry.imageUrl} // Disable button if no image
                         >
                            {entry.imageUrl ? (
                                <img
                                    src={entry.imageUrl}
                                    alt={entry.foodItem}
                                    className="w-full h-full object-cover"
                                    data-ai-hint="logged food item"
                                    loading="lazy" // Add lazy loading
                                />
                            ) : (
                                <UtensilsCrossed className="w-6 h-6 opacity-50" />
                            )}
                        </button>
                    </DialogTrigger>

                    {/* Main Info */}
                    <div className="flex-grow overflow-hidden">
                       {/* Use a div for title to prevent implicit button nesting issues */}
                       <div className="text-lg font-semibold leading-tight mb-1 truncate" title={entry.foodItem}>
                          {entry.foodItem}
                       </div>
                        <CardDescription className="text-sm text-muted-foreground">
                            約 {Math.round(entry.calorieEstimate)} 卡路里
                            {entry.confidence !== undefined && entry.confidence < 0.7 && entry.calorieEstimate > 0 && ( // Show confidence only if it's a food item with > 0 calories
                                <span className="text-orange-600 ml-1 text-xs">(低信賴度)</span>
                            )}
                        </CardDescription>
                         <div className="text-xs text-muted-foreground mt-1 flex items-center flex-wrap gap-x-2 gap-y-1">
                             <span className="flex items-center"><Clock size={12} className="mr-1"/> {new Date(entry.timestamp).toLocaleString('zh-TW')}</span>
                             {entry.mealType && <span className="flex items-center"><UtensilsCrossed size={12} className="mr-1"/> {mealTypeTranslations[entry.mealType] || entry.mealType}</span>}
                             {entry.location && <span className="flex items-center"><MapPin size={12} className="mr-1"/> <span className="truncate" title={entry.location}>{entry.location}</span></span>}
                             {entry.cost !== null && typeof entry.cost === 'number' && ( // Check type before toFixed
                                <span className="flex items-center">
                                    <DollarSign size={12} className="mr-1"/> ${entry.cost.toFixed(2)}
                                </span>
                             )}
                         </div>
                          {/* Optional Notes Display */}
                          {entry.notes && (
                             <p className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">
                                 {entry.notes}
                             </p>
                          )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-1 ml-auto flex-shrink-0">
                         <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(entry)} aria-label="編輯記錄">
                            <Edit size={16} />
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                 <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="刪除記錄">
                                    <Trash2 size={16} />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>確定要刪除嗎？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        此操作無法復原。這將永久刪除「{entry.foodItem}」的記錄。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteLogEntry(entry.id)} className={buttonVariants({ variant: "destructive" })}>
                                        刪除
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </CardHeader>
        </Card>
    </React.Fragment>
 );


 const renderEstimationResult = () => (
    <Card className="mt-6 shadow-md">
        <CardHeader>
            <CardTitle>估算結果</CardTitle>
            <CardDescription>AI 對您照片的分析。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {estimation?.isFoodItem === false && (
                 <Alert variant="orange" className="mb-4">
                     <Info className="h-4 w-4" />
                     <AlertTitle>注意：可能不是食物</AlertTitle>
                     <AlertDescription>
                         AI 認為這張圖片中的「{estimation.foodItem}」可能不是食物。記錄的卡路里將為 0，但您可以稍後編輯。
                     </AlertDescription>
                 </Alert>
            )}
            <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">偵測到的食物：</span>
                <span className="text-muted-foreground">{estimation?.foodItem ?? '讀取中...'}</span>
            </div>
            {/* Editable Calorie Estimate */}
            <div className="flex items-center justify-between">
                 <Label htmlFor="est-calories" className="font-medium text-foreground flex items-center">
                     <Edit size={12} className="mr-1 opacity-70"/> 估計卡路里：
                 </Label>
                  <Input
                     id="est-calories"
                     type="number"
                     value={estimation?.calorieEstimate ?? ''}
                     onChange={(e) => handleEstimationCalorieChange(e.target.value)}
                     className="font-semibold text-primary h-8 w-24 text-right"
                     aria-label="編輯估計卡路里"
                     disabled={estimation === null} // Disable if no estimation yet
                 />
            </div>
             {estimation?.isFoodItem && estimation?.confidence !== undefined && (
                 <div className="flex items-center justify-between">
                     <span className="font-medium text-foreground">信賴度：</span>
                     <span className={`text-sm ${estimation.confidence > 0.7 ? 'text-green-600' : 'text-orange-600'}`}>
                         {Math.round(estimation.confidence * 100)}%
                     </span>
                 </div>
             )}

             <div className="flex items-center justify-center mt-4 relative w-full aspect-video rounded-md overflow-hidden border bg-muted">
                  {imageSrc ? (
                     <img src={imageSrc} alt="拍攝的食物" className="object-contain max-h-full max-w-full" />
                   ) : (
                     <UtensilsCrossed className="w-12 h-12 text-muted-foreground opacity-50" />
                   )}
             </div>

        </CardContent>
        <CardFooter className="flex justify-end gap-2">
             <Button variant="outline" onClick={() => { setImageSrc(null); setEstimation(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                 清除
             </Button>
             <Button onClick={logCalories} variant="default" disabled={!imageSrc}> {/* Disable if no image */}
                 <Plus className="mr-2 h-4 w-4" /> 記錄卡路里
             </Button>
        </CardFooter>
    </Card>
);


 const renderLogList = () => {


     // Check for localStorage errors and display a persistent warning if needed
     const renderStorageError = () => {
        if (!isClient) return null; // Only render errors on client
        const errorMessages = [
            logError,
            profileError,
            waterLogError,
            notificationSettingsError
        ].filter(Boolean); // Filter out null errors

         if (errorMessages.length === 0) return null;

         // Display the first error encountered
         const firstError = errorMessages[0];
         let title = '儲存空間錯誤';
         if (firstError === profileError) title = '設定檔儲存錯誤';
         else if (firstError === waterLogError) title = '飲水記錄儲存錯誤';
         else if (firstError === notificationSettingsError) title = '通知設定儲存錯誤';

         return (
             <Alert variant="destructive" className="my-4">
                 <Info className="h-4 w-4" />
                 <AlertTitle>{title}</AlertTitle>
                 <AlertDescription>{firstError?.message || '處理資料時發生錯誤。儲存空間可能已滿。'}</AlertDescription>
             </Alert>
         );
     };


    if (!isClient) {
        // Render placeholder or loading state on the server
        return (
             <div className="mt-6">
                <h2 className="text-2xl font-semibold mb-4 text-primary">卡路里記錄摘要</h2>
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                         <Card key={i} className="mb-4 opacity-50 animate-pulse">
                            <CardHeader className="p-4">
                                <div className="flex items-start space-x-4">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-muted border flex-shrink-0"></div>
                                    <div className="flex-grow space-y-2">
                                        <div className="h-4 bg-muted rounded w-3/4"></div>
                                        <div className="h-3 bg-muted rounded w-1/2"></div>
                                        <div className="h-3 bg-muted rounded w-5/6"></div>
                                    </div>
                                     <div className="flex flex-col sm:flex-row items-center gap-1 ml-auto flex-shrink-0">
                                         <div className="h-8 w-8 bg-muted rounded"></div>
                                         <div className="h-8 w-8 bg-muted rounded"></div>
                                     </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (calorieLog.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-10 mt-6">
           {renderStorageError()}
          <UtensilsCrossed className="mx-auto h-12 w-12 opacity-50 mb-4" />
          <p>尚未記錄任何卡路里。</p>
          <p>使用上方的相機或上傳按鈕開始記錄！</p>
        </div>
      );
    }

    // Group by date
    const groupedLog = calorieLog.reduce((acc, entry) => {
      if (!entry || !entry.timestamp) return acc; // Skip invalid entries
      const date = new Date(entry.timestamp).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {} as Record<string, CalorieLogEntry[]>);


    return (
        <div className="mt-6">
            {renderStorageError()}
            <h2 className="text-2xl font-semibold mb-4 text-primary">卡路里記錄摘要</h2>
             {Object.entries(groupedLog).map(([date, entries]) => (
                <div key={date} className="mb-6">
                    <h3 className="text-lg font-medium mb-3 border-b pb-1 text-muted-foreground">{date}</h3>
                     <div className="space-y-4">
                        {entries.map(renderLogEntry)}
                    </div>
                </div>
             ))}
        </div>
    );
};


 const renderWaterTracker = () => (
    <Card className="mt-6 shadow-md">
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Droplet size={24} className="text-blue-500" /> 每日飲水追蹤
            </CardTitle>
             <CardDescription>
                  建議飲水量：{recommendedWater ? `${recommendedWater} 毫升` : '請完成個人資料'} (約 {Math.ceil((recommendedWater || defaultWaterTarget) / 250)} 杯)。
                  {userProfile.weight && <span className="text-xs"> (基於 {userProfile.weight} 公斤體重)</span>}
             </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Progress value={waterProgress} aria-label={`今日飲水進度 ${Math.round(waterProgress)}%`} className="h-3" />
            <div className="text-center font-medium text-muted-foreground">
                今日已喝： {todayWaterIntake} / {recommendedWater || defaultWaterTarget} 毫升 ({Math.round(waterProgress)}%)
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
                <Button onClick={() => addWater(250)} variant="outline" size="sm" disabled={!isClient}>
                    <Plus className="mr-1 h-4 w-4" /> 250ml (一杯)
                </Button>
                <Button onClick={() => addWater(500)} variant="outline" size="sm" disabled={!isClient}>
                    <Plus className="mr-1 h-4 w-4" /> 500ml (一瓶)
                </Button>
                 <Button onClick={() => addWater(-250)} variant="outline" size="sm" disabled={!isClient || todayWaterIntake <= 0}>
                     <Trash2 className="mr-1 h-4 w-4" /> 移除 250ml
                 </Button>
                <Button onClick={resetWater} variant="destructive" size="sm" disabled={!isClient}>
                    <RotateCw className="mr-1 h-4 w-4" /> 重設今日
                </Button>
            </div>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
            保持水分充足對健康至關重要！成人每日建議飲水 8 杯 (約 2000 毫升)。
        </CardFooter>
    </Card>
);

 const renderProfileStats = () => (
    <Card className="mt-6 shadow-md">
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <User size={24} /> 個人資料 & 統計
            </CardTitle>
            <CardDescription>根據您的個人資料計算的健康指標。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
             {profileError && isClient && ( // Only show profile error on client
                 <Alert variant="destructive" className="mb-4">
                     <Info className="h-4 w-4" />
                     <AlertTitle>設定檔儲存錯誤</AlertTitle>
                     <AlertDescription>{profileError.message || '無法儲存個人資料變更。儲存空間可能已滿。'}</AlertDescription>
                 </Alert>
             )}
             <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                 <span className="font-medium text-foreground">年齡：</span>
                 <span className="text-muted-foreground">{userProfile.age ?? '未設定'}</span>

                 <span className="font-medium text-foreground">性別：</span>
                 <span className="text-muted-foreground">{userProfile.gender === 'male' ? '男性' : userProfile.gender === 'female' ? '女性' : userProfile.gender === 'other' ? '其他' : '未設定'}</span>

                 <span className="font-medium text-foreground">身高：</span>
                 <span className="text-muted-foreground">{userProfile.height ? `${userProfile.height} 公分` : '未設定'}</span>

                 <span className="font-medium text-foreground">體重：</span>
                 <span className="text-muted-foreground">{userProfile.weight ? `${userProfile.weight} 公斤` : '未設定'}</span>

                 <span className="font-medium text-foreground">活動水平：</span>
                  <span className="text-muted-foreground truncate" title={userProfile.activityLevel ? activityLevelTranslations[userProfile.activityLevel] : '未設定'}>
                      {userProfile.activityLevel ? activityLevelTranslations[userProfile.activityLevel] : '未設定'}
                  </span>
             </div>
             <hr className="my-3 border-border" />
             <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                 <span className="font-medium text-foreground">BMI：</span>
                 <span className="text-muted-foreground">{bmi ? bmi.toFixed(1) : 'N/A'}</span>

                 <span className="font-medium text-foreground">BMR (基礎代謝率)：</span>
                 <span className="text-muted-foreground">{bmr ? Math.round(bmr) + ' 卡' : 'N/A'}</span>

                 <span className="font-medium text-foreground">每日建議卡路里：</span>
                 <span className="text-muted-foreground">{dailyCalories ? Math.round(dailyCalories) + ' 卡' : 'N/A'}</span>

                  <span className="font-medium text-foreground">建議飲水量：</span>
                  <span className="text-muted-foreground">{recommendedWater ? `${recommendedWater} 毫升` : 'N/A'}</span>
             </div>
              {/* Apple Health Integration Button */}
              <div className="pt-4">
                  <Button variant="outline" className="w-full" onClick={() => toast({ title: '尚未實作', description: 'Apple 健康整合即將推出！' })} disabled={!isClient}>
                       <Apple className="mr-2 h-4 w-4" /> 連接 Apple 健康
                  </Button>
              </div>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
             基礎代謝率 (BMR) 是您身體在休息時燃燒的卡路里數量。BMI 是體重指數。
        </CardFooter>
    </Card>
);


  const renderEditDialog = () => (
     <Dialog open={isEditing} onOpenChange={setIsEditing}>
         <DialogContent className="max-h-[90vh] overflow-y-auto">
             <DialogHeader>
                 <DialogTitle>編輯記錄項目</DialogTitle>
                 <DialogDescription>
                     更新此食物記錄的詳細資料。
                 </DialogDescription>
             </DialogHeader>
             {editingEntry && (
                 <div className="grid gap-4 py-4">
                     {/* Food Item Name */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-foodItem" className="text-right">
                             食物
                         </Label>
                         <Input
                             id="edit-foodItem"
                             value={editingEntry.foodItem}
                             onChange={(e) => handleEditChange('foodItem', e.target.value)}
                             className="col-span-3"
                         />
                     </div>
                     {/* Calories */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-calorieEstimate" className="text-right">
                             卡路里
                         </Label>
                         <Input
                             id="edit-calorieEstimate"
                             type="number"
                             value={editingEntry.calorieEstimate}
                             onChange={(e) => handleEditChange('calorieEstimate', e.target.value)}
                             className="col-span-3"
                             min="0" // Ensure calories are not negative
                         />
                     </div>
                     {/* Timestamp */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-timestamp" className="text-right">
                             時間
                         </Label>
                         <Input
                             id="edit-timestamp"
                             type="datetime-local" // Use datetime-local for date and time
                             value={editingEntry.timestamp ? editingEntry.timestamp.substring(0, 16) : ''} // Format for input YYYY-MM-DDTHH:mm
                             onChange={(e) => handleEditChange('timestamp', e.target.value)}
                             className="col-span-3"
                             max={new Date().toISOString().substring(0, 16)} // Prevent selecting future dates/times
                         />
                     </div>
                      {/* Meal Type */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-mealType" className="text-right">
                             餐別
                         </Label>
                          <Select
                             value={editingEntry.mealType || ''}
                             onValueChange={(value) => handleEditChange('mealType', value)} // Pass value directly
                         >
                             <SelectTrigger id="edit-mealType" className="col-span-3">
                                 <SelectValue placeholder="選擇餐別 (選填)" />
                             </SelectTrigger>
                             <SelectContent>
                                  <SelectItem value="">-- 無 --</SelectItem> {/* Option for null */}
                                 <SelectItem value="Breakfast">{mealTypeTranslations['Breakfast']}</SelectItem>
                                 <SelectItem value="Lunch">{mealTypeTranslations['Lunch']}</SelectItem>
                                 <SelectItem value="Dinner">{mealTypeTranslations['Dinner']}</SelectItem>
                                 <SelectItem value="Snack">{mealTypeTranslations['Snack']}</SelectItem>
                             </SelectContent>
                         </Select>
                     </div>
                     {/* Location */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-location" className="text-right">
                             地點
                         </Label>
                         <Input
                             id="edit-location"
                             value={editingEntry.location || ''}
                             onChange={(e) => handleEditChange('location', e.target.value)}
                             className="col-span-3"
                             placeholder="例如：家裡、餐廳名稱 (選填)"
                         />
                     </div>
                     {/* Cost */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-cost" className="text-right">
                             金額
                         </Label>
                         <Input
                             id="edit-cost"
                             type="number"
                             step="0.01"
                             min="0" // Cost cannot be negative
                             value={editingEntry.cost === null ? '' : editingEntry.cost.toString()} // Ensure value is string for input
                             onChange={(e) => handleEditChange('cost', e.target.value)}
                             className="col-span-3"
                             placeholder="輸入金額 (選填)"
                         />
                     </div>
                       {/* Notes */}
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-notes" className="text-right">
                             備註
                         </Label>
                         <Textarea
                             id="edit-notes"
                             value={editingEntry.notes || ''}
                             onChange={(e) => handleEditChange('notes', e.target.value)}
                             className="col-span-3"
                             placeholder="新增備註 (選填)"
                             rows={3}
                         />
                     </div>
                 </div>
             )}
             <DialogFooter>
                 <DialogClose asChild>
                     <Button type="button" variant="outline">取消</Button>
                 </DialogClose>
                 <Button type="button" onClick={saveEdit}>儲存變更</Button>
             </DialogFooter>
         </DialogContent>
     </Dialog>
 );

  const renderImageModal = () => (
    <Dialog open={!!showImageModal} onOpenChange={() => setShowImageModal(null)}>
        <DialogContent className="max-w-3xl p-2">
             {showImageModal && (
                 // eslint-disable-next-line @next/next/no-img-element
                <img src={showImageModal} alt="放大檢視" className="max-w-full max-h-[80vh] object-contain rounded-md" />
             )}
             <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="absolute top-3 right-3 h-7 w-7 bg-background/50 hover:bg-background/80 rounded-full" aria-label="關閉">
                     <X size={18}/>
                  </Button>
             </DialogClose>
        </DialogContent>
    </Dialog>
 );

  // Cropping Dialog
 const renderCropDialog = () => (
    <Dialog open={isCropping} onOpenChange={setIsCropping}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>裁切影像</DialogTitle>
          <DialogDescription>
            拖曳選框以裁切您的食物照片。留空以使用完整圖片。
          </DialogDescription>
        </DialogHeader>
        {imageSrc && (
             <div className="my-4 flex justify-center max-h-[60vh] overflow-auto">
                <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspect} // Use undefined for free crop
                    // minWidth={50} // Optional: Minimum crop size
                    // minHeight={50}
                    // ruleOfThirds // Optional: Show rule of thirds grid
                    // circularCrop // Optional: If you want a circular crop
                >
                 <img
                     ref={imgRef}
                     alt="裁切預覽"
                     src={imageSrc}
                     style={{ transform: `scale(1) rotate(0deg)` }} // Basic styles, add rotation/scale if needed
                     onLoad={onImageLoad}
                     className="max-h-full max-w-full object-contain" // Ensure image fits container
                 />
                </ReactCrop>
            </div>
        )}
        <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Button to toggle aspect ratio */}
            {/* <Button
                variant="outline"
                onClick={() => setAspect(aspect ? undefined : 1)}
                className="w-full sm:w-auto"
            >
                {aspect ? "自由裁切" : "鎖定比例 (1:1)"}
            </Button> */}
           <Button variant="outline" onClick={() => setIsCropping(false)} className="w-full sm:w-auto">取消</Button>
           <Button onClick={handleCropConfirm} className="w-full sm:w-auto">確認裁切</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
 );


 // Profile Editing Section
 const renderProfileEditor = () => (
     <Card className="mt-6 shadow-md">
         <CardHeader>
             <CardTitle className="flex items-center gap-2"><Settings size={24} /> 個人資料設定</CardTitle>
              <CardDescription>更新您的個人資訊以取得更準確的計算。</CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
               {profileError && isClient && ( // Only show error on client
                 <Alert variant="destructive" className="mb-4">
                     <Info className="h-4 w-4" />
                     <AlertTitle>設定檔儲存錯誤</AlertTitle>
                     <AlertDescription>{profileError.message || '無法儲存個人資料變更。儲存空間可能已滿。'}</AlertDescription>
                 </Alert>
              )}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Age */}
                 <div className="space-y-1">
                     <Label htmlFor="age">年齡</Label>
                     <Input
                         id="age"
                         type="number"
                         placeholder="輸入您的年齡"
                         value={userProfile.age === null ? '' : userProfile.age}
                         onChange={(e) => handleProfileChange('age', e.target.value)}
                         min="1" // Minimum age 1
                         disabled={!isClient} // Disable on server
                     />
                 </div>
                 {/* Gender */}
                 <div className="space-y-1">
                     <Label htmlFor="gender">生理性別</Label>
                      <Select
                         value={userProfile.gender || ''}
                         onValueChange={(value) => handleProfileChange('gender', value)}
                         disabled={!isClient} // Disable on server
                      >
                         <SelectTrigger id="gender" aria-label="選取生理性別">
                             <SelectValue placeholder="選取生理性別" />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="">-- 未設定 --</SelectItem>
                             <SelectItem value="male">男性</SelectItem>
                             <SelectItem value="female">女性</SelectItem>
                             <SelectItem value="other">其他</SelectItem>
                         </SelectContent>
                      </Select>
                 </div>
                  {/* Height */}
                 <div className="space-y-1">
                     <Label htmlFor="height">身高 (公分)</Label>
                     <Input
                         id="height"
                         type="number"
                         placeholder="輸入您的身高 (公分)"
                         value={userProfile.height === null ? '' : userProfile.height}
                         onChange={(e) => handleProfileChange('height', e.target.value)}
                          min="1" // Minimum height 1cm
                          disabled={!isClient} // Disable on server
                     />
                 </div>
                  {/* Weight */}
                 <div className="space-y-1">
                     <Label htmlFor="weight">體重 (公斤)</Label>
                     <Input
                         id="weight"
                         type="number"
                         placeholder="輸入您的體重 (公斤)"
                         value={userProfile.weight === null ? '' : userProfile.weight}
                         onChange={(e) => handleProfileChange('weight', e.target.value)}
                         min="1" // Minimum weight 1kg
                         step="0.1" // Allow decimal for weight
                         disabled={!isClient} // Disable on server
                     />
                 </div>
                 {/* Activity Level */}
                 <div className="space-y-1 sm:col-span-2">
                     <Label htmlFor="activityLevel">活動水平</Label>
                     <Select
                         value={userProfile.activityLevel || ''}
                         onValueChange={(value) => handleProfileChange('activityLevel', value)}
                         disabled={!isClient} // Disable on server
                     >
                         <SelectTrigger id="activityLevel" aria-label="選取活動水平">
                             <SelectValue placeholder="選取您的活動水平" />
                         </SelectTrigger>
                         <SelectContent>
                              <SelectItem value="">-- 未設定 --</SelectItem>
                             {Object.entries(activityLevelTranslations).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                             ))}
                         </SelectContent>
                     </Select>
                 </div>
             </div>
         </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
             更新這些資訊將重新計算您的 BMI、BMR 和建議卡路里/飲水量。
          </CardFooter>
     </Card>
 );


 // Notification Settings Trigger Button
 const renderNotificationSettingsTrigger = () => (
     <Sheet>
         <SheetTrigger asChild>
             <Button variant="outline" className="w-full mt-6" disabled={!isClient}>
                 <Bell className="mr-2 h-4 w-4" /> 開啟飲水通知設定
             </Button>
         </SheetTrigger>
         {/* SheetContent is rendered inside the NotificationSettingsSheet component */}
         <NotificationSettingsSheet />
     </Sheet>
 );


  return (
    <Dialog> {/* Main Dialog wrapper for modals */}
        <Tabs defaultValue="logging" className="w-full">
             <TabsList className="grid w-full grid-cols-3 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                 <TabsTrigger value="logging" className="flex-1 text-center px-1">
                     <Camera className="mr-1 sm:mr-2 h-4 w-4 inline-block" />
                     <span className="truncate hidden sm:inline">拍照記錄 & 摘要</span>
                     <span className="truncate sm:hidden">記錄</span>
                 </TabsTrigger>
                 <TabsTrigger value="tracking" className="flex-1 text-center px-1">
                     <Droplet className="mr-1 sm:mr-2 h-4 w-4 inline-block" />
                     <span className="truncate hidden sm:inline">飲水 & 資料</span>
                     <span className="truncate sm:hidden">資料</span>
                 </TabsTrigger>
                 <TabsTrigger value="settings" className="flex-1 text-center px-1">
                     <Settings className="mr-1 sm:mr-2 h-4 w-4 inline-block" />
                     <span className="truncate hidden sm:inline">設定</span>
                     <span className="truncate sm:hidden">設定</span>
                 </TabsTrigger>
            </TabsList>

             {/* Tab 1: Logging & Summary */}
            <TabsContent value="logging" className="pt-4">
                 <Card className="mb-6 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Camera size={24} /> 點擊選擇上傳影像或拍攝照片</CardTitle>
                        <CardDescription>使用您的相機拍攝食物照片，或從您的裝置上傳影像。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Camera Preview */}
                        <div className="relative aspect-video w-full rounded-md overflow-hidden border bg-muted mb-4">
                            <video
                                ref={videoRef}
                                className={cn(
                                    "w-full h-full object-cover transition-opacity duration-300",
                                    hasCameraPermission === false ? 'opacity-0 pointer-events-none' : 'opacity-100'
                                )}
                                autoPlay
                                muted
                                playsInline // Important for mobile
                                // Consider adding poster attribute for initial state
                            />
                             {/* Loading State */}
                             {hasCameraPermission === null && (
                                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                                    <LoadingSpinner />
                                </div>
                            )}
                             {/* No Permission State */}
                            {hasCameraPermission === false && (
                                 <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-muted">
                                     <Camera size={48} className="text-muted-foreground opacity-50 mb-2" />
                                     <p className="text-muted-foreground">相機無法使用或權限遭拒。</p>
                                     <p className="text-xs text-muted-foreground mt-1">請允許相機存取或使用上傳按鈕。</p>
                                      {/* Optionally add a button to re-request permission if needed */}
                                     {/* <Button onClick={getCameraPermission} variant="outline" size="sm" className="mt-2">重試</Button> */}
                                 </div>
                            )}
                        </div>

                        {/* Capture/Upload Buttons */}
                        <div className="flex flex-col sm:flex-row gap-2">
                             <Button onClick={captureImage} disabled={!isClient || hasCameraPermission !== true || isLoading} className="flex-1">
                                 <Camera className="mr-2 h-4 w-4" /> 拍攝照片
                             </Button>
                            <Button onClick={() => fileInputRef.current?.click()} disabled={!isClient || isLoading} variant="outline" className="flex-1">
                                <UploadCloud className="mr-2 h-4 w-4" /> 上傳影像
                            </Button>
                            <Input
                                type="file"
                                ref={fileInputRef}
                                onChange={uploadImage}
                                accept="image/*" // Specify image types
                                className="hidden"
                                aria-hidden="true" // Hide from accessibility tree
                            />
                        </div>

                        {/* Loading and Error States */}
                        {isLoading && (
                            <div className="mt-4 flex justify-center items-center gap-2 text-primary">
                                <LoadingSpinner />
                                <span>正在估算卡路里...</span>
                            </div>
                        )}
                         {error && isClient && ( // Only show error on client
                           <Alert variant="destructive" className="mt-4">
                             <AlertTitle>錯誤</AlertTitle>
                             <AlertDescription>{error}</AlertDescription>
                           </Alert>
                         )}
                    </CardContent>
                </Card>

                 {/* Estimation Result (only show if imageSrc exists and not cropping, and on client) */}
                 {isClient && imageSrc && !isCropping && renderEstimationResult()}

                 {/* Calorie Log Summary */}
                {renderLogList()}

            </TabsContent>

             {/* Tab 2: Water Tracking & Profile Stats */}
            <TabsContent value="tracking" className="pt-4">
                {renderWaterTracker()}
                {renderProfileStats()}
            </TabsContent>

             {/* Tab 3: Settings */}
             <TabsContent value="settings" className="pt-4">
                 {renderProfileEditor()}
                 {renderNotificationSettingsTrigger()}
                 {/* Add other settings components here if needed */}
             </TabsContent>
        </Tabs>

        {/* Render Modals outside TabsContent for proper stacking */}
        {renderEditDialog()}
        {renderImageModal()}
        {renderCropDialog()}
    </Dialog>
  );
}

