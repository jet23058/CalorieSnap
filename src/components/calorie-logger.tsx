
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
  // BarChart, // Removed as it's not used currently
  ZoomIn,
  X,
  UploadCloud,
  RotateCw,
  MapPin,
  Clock,
  DollarSign,
  Info,
  Settings,
  Apple, // Added Apple icon
  CalendarDays,
  Trash, // Added for deleting water entries
  Cat, // Added for achievement badge
  Trophy, // Added for achievement section title
  Image as ImageIcon, // Added for photo achievement badge
  NotebookText, // Icon for Nutritionist Comments
  ArrowDownUp, // Icon for sorting
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import ReactCrop, { type Crop, centerCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Sheet, SheetTrigger } from '@/components/ui/sheet'; // Import Sheet components
import { NotificationSettingsSheet, NotificationSettings, defaultSettings as defaultNotificationSettings } from '@/components/notification-settings-sheet'; // Import the settings types
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
import { Calendar } from "@/components/ui/calendar";
import { format, isSameDay, startOfDay, subDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Import Accordion components
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Import RadioGroup components


type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type LogViewMode = 'daily' | 'monthly';
type MonthlySortCriteria = 'time-desc' | 'time-asc' | 'calories-desc' | 'calories-asc';


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
  nutritionistComment?: string; // Placeholder for nutritionist comments
}

// New interface for individual water log entries
export interface WaterLogEntry {
    id: string;
    timestamp: string; // ISO string format
    amount: number; // in ml
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
const calculateRecommendedWater = (profile: UserProfile): number | null => {
    if (!profile.weight) return null; // Return null if no weight
    return Math.round(profile.weight * 35);
};

// Function to get current date as YYYY-MM-DD
const getCurrentDate = (): string => {
    return format(startOfDay(new Date()), 'yyyy-MM-dd'); // Ensure it's just the date part
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
  // Updated waterLog state to store individual entries per day
  const [waterLog, setWaterLog, waterLogError] = useLocalStorage<Record<string, WaterLogEntry[]>>('waterLog', {}); // { 'YYYY-MM-DD': [WaterLogEntry, ...] }
  const [notificationSettings, setNotificationSettings, notificationSettingsError] = useLocalStorage<NotificationSettings>('notificationSettings', defaultNotificationSettings);
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(startOfDay(new Date())); // State for calendar date selection
  const [customWaterAmount, setCustomWaterAmount] = useState<string>(''); // State for custom water input
  const [logViewMode, setLogViewMode] = useState<LogViewMode>('daily'); // State for log view mode
  const [monthlySortCriteria, setMonthlySortCriteria] = useState<MonthlySortCriteria>('time-desc'); // State for monthly sorting


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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]); // Only depend on isClient to run once on mount


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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]); // Only depend on isClient


  // --- Crop Logic ---

  function centerAspectCrop(
    mediaWidth: number,
    mediaHeight: number,
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
  }


  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    // Center the crop area, defaulting to full image
    const initialCrop = centerAspectCrop(width, height); // Always use undefined for full crop initially
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
                // Use the custom orange variant defined in ui/alert.tsx
                variant: "orange" as any, // Cast to any to bypass type check for custom variant
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

  // Placeholder function to get nutritionist comment (replace with actual logic/AI call)
  const getNutritionistComment = (entry: Omit<CalorieLogEntry, 'id' | 'nutritionistComment'>): string => {
      // Basic example logic based on calories
      if (entry.calorieEstimate > 600) {
          return `提醒：此餐點熱量 (${Math.round(entry.calorieEstimate)} 卡) 偏高。建議留意份量控制，或搭配較低熱量的食物。多攝取蔬菜水果有助於均衡營養。`;
      } else if (entry.calorieEstimate < 200 && entry.mealType !== 'Snack') {
          return `注意：此餐點熱量 (${Math.round(entry.calorieEstimate)} 卡) 可能偏低。請確保攝取足夠的營養以維持身體機能。可考慮增加蛋白質或健康脂肪的攝取。`;
      } else if (entry.foodItem.toLowerCase().includes('點心') || entry.foodItem.toLowerCase().includes('甜點') || entry.mealType === 'Snack') {
          return `提醒：點心建議選擇天然、未加工的食物，如水果、堅果或優格，以獲取更豐富的營養。注意糖分攝取。`;
      }
      // Default comment if no specific condition met
      return `請保持均衡飲食，多樣化攝取各類食物，並注意水分補充。`;
  };


  const logCalories = () => {
    // Allow logging even if only imageSrc exists (before estimation finishes or if it fails)
    if (imageSrc) {
        const currentEstimation = estimation; // Capture current estimation state
        const baseEntry: Omit<CalorieLogEntry, 'id' | 'nutritionistComment'> = {
            foodItem: currentEstimation?.foodItem ?? "未辨識", // Default if no estimation
            calorieEstimate: currentEstimation?.isFoodItem ? (currentEstimation.calorieEstimate ?? 0) : 0, // Use 0 if not food or undefined
            imageUrl: imageSrc, // Log the (potentially cropped) image
            timestamp: new Date().toISOString(),
            mealType: null, // User can set this later
            location: currentLocation && currentLocation !== '正在獲取...' && !currentLocation.startsWith('無法') && !currentLocation.startsWith('瀏覽器') ? currentLocation : null, // Log location if available and not an error/loading state
            cost: null,
            confidence: currentEstimation?.isFoodItem ? (currentEstimation.confidence ?? 0) : 0, // Use 0 if not food or undefined
        };

         // Generate nutritionist comment based on the entry details
        const nutritionistComment = getNutritionistComment(baseEntry);

        const newEntry: CalorieLogEntry = {
            ...baseEntry,
            id: Date.now().toString(), // Simple unique ID
            nutritionistComment: nutritionistComment, // Add the generated comment
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
         // Handle errors from useLocalStorage
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
       // Handle meal type selection where "none" means null
       else if (field === 'mealType' && value === 'none') {
           processedValue = null;
       }

      setEditingEntry(prev => prev ? { ...prev, [field]: processedValue } : null);
    }
  };


  const saveEdit = () => {
    if (editingEntry) {
      try {
         // Re-generate nutritionist comment if relevant fields changed
         const baseEntry: Omit<CalorieLogEntry, 'id' | 'nutritionistComment'> = { ...editingEntry };
         const updatedComment = getNutritionistComment(baseEntry);
         const finalEntry = { ...editingEntry, nutritionistComment: updatedComment };


        setCalorieLog(prevLog =>
            prevLog.map(entry =>
                entry.id === finalEntry.id ? finalEntry : entry
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
      // Prevent updates on server
      if (!isClient) return;

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
      if (field === 'activityLevel') {
         if (value === 'none') {
             processedValue = null;
         } else if (value !== null && !(value in activityLevelMultipliers)) {
              processedValue = null; // Or maybe keep previous value? For now, nullify.
         }
      }
      // Ensure gender is one of the valid options or null
      if (field === 'gender') {
          if (value === 'none') {
              processedValue = null;
          } else if (value !== null && !['male', 'female', 'other'].includes(value)) {
             processedValue = null;
          }
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
  const calculatedRecommendedWater = useMemo(() => calculateRecommendedWater(userProfile), [userProfile]); // Renamed for clarity
  const defaultWaterTarget = 2000; // Default target if profile is incomplete or weight not set


   // --- Water Tracking ---

   const addWater = (amountToAdd: number) => { // amount in ml
       if (!isClient || isNaN(amountToAdd) || amountToAdd <= 0) {
           toast({ variant: 'destructive', title: "無效數量", description: "請輸入有效的正數水量。" });
           return;
       }

       const today = getCurrentDate();
       const newWaterEntry: WaterLogEntry = {
           id: Date.now().toString(),
           timestamp: new Date().toISOString(),
           amount: amountToAdd,
       };

       try {
           setWaterLog(prevLog => {
               const todaysEntries = prevLog[today] || [];
               // Basic check to prevent excessively large logs for a single day
               if (todaysEntries.length >= 50) { // Example limit: 50 water entries per day
                   throw new LocalStorageError('今日飲水記錄已滿。');
               }
               return {
                   ...prevLog,
                   [today]: [...todaysEntries, newWaterEntry],
               };
           });
           toast({ title: "已記錄飲水", description: `已新增 ${amountToAdd} 毫升。` });
           setCustomWaterAmount(''); // Clear custom input after logging
       } catch (storageError: any) {
           if (storageError instanceof LocalStorageError) {
               toast({ variant: 'destructive', title: '記錄錯誤', description: storageError.message });
           } else {
               toast({ variant: 'destructive', title: '記錄錯誤', description: '記錄飲水時發生未預期的錯誤。' });
           }
           console.error("記錄飲水時發生錯誤:", storageError);
       }
   };

  const deleteWaterEntry = (id: string) => {
      if (!isClient || !selectedDate) return;
      const dateKey = format(selectedDate, 'yyyy-MM-dd');

      try {
          setWaterLog(prevLog => {
              const todaysEntries = prevLog[dateKey] || [];
              const updatedEntries = todaysEntries.filter(entry => entry.id !== id);
              return {
                  ...prevLog,
                  [dateKey]: updatedEntries,
              };
          });
          toast({ title: "刪除成功", description: "飲水記錄已刪除。" });
      } catch (storageError: any) {
          if (storageError instanceof LocalStorageError) {
              toast({ variant: 'destructive', title: '刪除錯誤', description: storageError.message });
          } else {
              toast({ variant: 'destructive', title: '刪除錯誤', description: '刪除飲水記錄時發生未預期的錯誤。' });
          }
          console.error("刪除飲水記錄時發生錯誤:", storageError);
      }
  };


  const resetTodaysWater = () => {
      if (!isClient || !selectedDate) return;
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      try {
          setWaterLog(prevLog => ({ ...prevLog, [dateKey]: [] })); // Reset to empty array
          toast({ title: "已重設", description: `${format(selectedDate, 'yyyy/MM/dd')} 飲水量已重設。` });
      } catch (storageError: any) {
          if (storageError instanceof LocalStorageError) {
              toast({ variant: 'destructive', title: '重設錯誤', description: storageError.message });
          } else {
              toast({ variant: 'destructive', title: '重設錯誤', description: '重設飲水時發生未預期的錯誤。' });
          }
          console.error("重設飲水時發生錯誤:", storageError);
      }
  };


   // Calculate total water intake for the selected date
   const selectedDateWaterIntake = useMemo(() => {
       if (!isClient || !selectedDate) return 0;
       const dateKey = format(selectedDate, 'yyyy-MM-dd');
       const entries = waterLog[dateKey] || [];
       return entries.reduce((total, entry) => total + entry.amount, 0);
   }, [waterLog, selectedDate, isClient]);

   const currentRecommendedWater = calculatedRecommendedWater ?? defaultWaterTarget; // Use default if null
   const waterProgress = currentRecommendedWater ? Math.min((selectedDateWaterIntake / currentRecommendedWater) * 100, 100) : 0;

   // Calculate yesterday's water intake and achievement
   const yesterdayWaterIntake = useMemo(() => {
        if (!isClient) return 0;
        const yesterdayDate = subDays(new Date(), 1);
        const yesterdayKey = format(yesterdayDate, 'yyyy-MM-dd');
        const entries = waterLog[yesterdayKey] || [];
        return entries.reduce((total, entry) => total + entry.amount, 0);
   }, [waterLog, isClient]);

   const yesterdayWaterGoalMet = yesterdayWaterIntake >= currentRecommendedWater;


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
             {/* Nutritionist Comment Accordion */}
             {entry.nutritionistComment && (
                 <Accordion type="single" collapsible className="w-full px-4 pb-2">
                     <AccordionItem value={`comment-${entry.id}`} className="border-b-0">
                         <AccordionTrigger className="text-xs text-muted-foreground py-1 hover:no-underline">
                             <div className="flex items-center gap-1">
                                 <NotebookText size={14} />
                                 <span>營養師評論</span>
                             </div>
                         </AccordionTrigger>
                         <AccordionContent className="text-xs text-muted-foreground pt-1">
                             {entry.nutritionistComment}
                         </AccordionContent>
                     </AccordionItem>
                 </Accordion>
             )}
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


 // Filter logs based on view mode and selected date/month
 const filteredLog = useMemo(() => {
     if (!selectedDate) return [];

     let logsToDisplay: CalorieLogEntry[];

     if (logViewMode === 'daily') {
         logsToDisplay = calorieLog.filter(entry => {
             if (!entry || !entry.timestamp) return false;
             const entryDate = new Date(entry.timestamp);
             return isValidDate(entryDate) && isSameDay(entryDate, selectedDate);
         });
         // Daily view always sorts by time descending
         logsToDisplay.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

     } else { // Monthly view
         const monthStart = startOfMonth(selectedDate);
         const monthEnd = endOfMonth(selectedDate);
         logsToDisplay = calorieLog.filter(entry => {
             if (!entry || !entry.timestamp) return false;
             const entryDate = new Date(entry.timestamp);
             return isValidDate(entryDate) && isWithinInterval(entryDate, { start: monthStart, end: monthEnd });
         });

         // Apply monthly sorting
         switch (monthlySortCriteria) {
             case 'time-asc':
                 logsToDisplay.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                 break;
             case 'calories-desc':
                 logsToDisplay.sort((a, b) => b.calorieEstimate - a.calorieEstimate);
                 break;
             case 'calories-asc':
                 logsToDisplay.sort((a, b) => a.calorieEstimate - b.calorieEstimate);
                 break;
             case 'time-desc': // Default
             default:
                 logsToDisplay.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                 break;
         }
     }

     return logsToDisplay;

 }, [calorieLog, selectedDate, logViewMode, monthlySortCriteria]);


 // Get dates with calorie logs for calendar highlighting
 const calorieLoggedDays = useMemo(() => {
    if (!isClient) return [];
    const days = new Set<string>();
    calorieLog.forEach(entry => {
        if (entry?.timestamp) {
            const date = startOfDay(new Date(entry.timestamp));
            if (isValidDate(date)) days.add(format(date, 'yyyy-MM-dd'));
        }
    });
    return Array.from(days).map(dateStr => new Date(dateStr));
 }, [calorieLog, isClient]);

 // Get dates with water logs for calendar highlighting
 const waterLoggedDays = useMemo(() => {
    if (!isClient) return [];
    return Object.keys(waterLog)
        .filter(dateKey => waterLog[dateKey]?.length > 0)
        .map(dateKey => new Date(dateKey));
 }, [waterLog, isClient]);


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

 const renderLogList = () => {
    if (!isClient) {
        // Render placeholder or loading state on the server
        return (
             <div className="mt-6">
                 <div className="flex justify-between items-center mb-4">
                     <h2 className="text-2xl font-semibold text-primary flex items-center gap-2"><CalendarDays size={24}/> 卡路里記錄摘要</h2>
                      {/* View Mode Toggle Placeholder */}
                      <Skeleton className="h-9 w-32 rounded-md" />
                 </div>

                 {/* Calendar/Month Selector Placeholder */}
                 <div className="mb-4 flex justify-center">
                     <Skeleton className="h-[300px] w-[350px] rounded-md" />
                 </div>
                  {/* Sorting Options Placeholder (for monthly view) */}
                  <div className="mb-4 flex justify-end">
                      <Skeleton className="h-9 w-40 rounded-md" />
                  </div>

                <div className="space-y-4">
                    {[...Array(2)].map((_, i) => ( // Reduced placeholder count
                         <Card key={i} className="mb-4 opacity-50 animate-pulse">
                            <CardHeader className="p-4">
                                <div className="flex items-start space-x-4">
                                    <Skeleton className="w-16 h-16 sm:w-20 sm:h-20 rounded-md flex-shrink-0"/>
                                    <div className="flex-grow space-y-2">
                                        <Skeleton className="h-4 rounded w-3/4"/>
                                        <Skeleton className="h-3 rounded w-1/2"/>
                                        <Skeleton className="h-3 rounded w-5/6"/>
                                    </div>
                                     <div className="flex flex-col sm:flex-row items-center gap-1 ml-auto flex-shrink-0">
                                         <Skeleton className="h-8 w-8 rounded"/>
                                         <Skeleton className="h-8 w-8 rounded"/>
                                     </div>
                                </div>
                            </CardHeader>
                             {/* Accordion Placeholder */}
                             <div className="px-4 pb-2">
                                 <Skeleton className="h-6 w-1/3 rounded"/>
                             </div>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

     const handleMonthChange = (month: Date) => {
        // When changing month in monthly view, set selectedDate to the first of that month
        setSelectedDate(startOfMonth(month));
     };


    return (
        <div className="mt-6">
            {renderStorageError()}
             <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
                <h2 className="text-2xl font-semibold text-primary flex items-center gap-2 shrink-0">
                    <CalendarDays size={24}/> 卡路里記錄摘要
                </h2>
                 {/* View Mode Toggle */}
                 <RadioGroup
                     defaultValue="daily"
                     value={logViewMode}
                     onValueChange={(value) => setLogViewMode(value as LogViewMode)}
                     className="flex space-x-2 bg-muted p-1 rounded-md"
                 >
                     <div className="flex items-center space-x-1">
                         <RadioGroupItem value="daily" id="view-daily" />
                         <Label htmlFor="view-daily" className="text-sm font-medium cursor-pointer">單日</Label>
                     </div>
                     <div className="flex items-center space-x-1">
                         <RadioGroupItem value="monthly" id="view-monthly" />
                         <Label htmlFor="view-monthly" className="text-sm font-medium cursor-pointer">整月</Label>
                     </div>
                 </RadioGroup>
            </div>


            {/* Calendar or Month Navigation */}
            <div className="mb-6 flex justify-center">
                 {logViewMode === 'daily' ? (
                     <Calendar
                         mode="single"
                         selected={selectedDate}
                         onSelect={setSelectedDate}
                         className="rounded-md border shadow-sm"
                         disabled={date => date > new Date() || date < new Date("1900-01-01")}
                         initialFocus
                         locale={zhTW} // Ensure locale is passed
                         modifiers={{
                             calorieLogged: calorieLoggedDays,
                             waterLogged: waterLoggedDays,
                             selected: selectedDate ? [selectedDate] : [], // Ensure selected date is visually marked
                         }}
                         modifiersStyles={{
                             calorieLogged: { fontWeight: 'bold' },
                             waterLogged: { border: '1px solid hsl(var(--chart-2))', borderRadius: '50%' },
                             selected: { // Style for selected date
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'hsl(var(--primary-foreground))',
                             },
                         }}
                         captionLayout="dropdown-buttons" // Use dropdowns for easier navigation
                         fromYear={2020} // Example start year
                         toYear={new Date().getFullYear()} // Current year
                     />
                 ) : (
                     <Calendar
                         mode="single"
                         selected={selectedDate}
                         onSelect={setSelectedDate} // Allow selecting a day within the month view
                         onMonthChange={handleMonthChange} // Handle month navigation
                         month={selectedDate} // Control the displayed month
                         className="rounded-md border shadow-sm"
                         disabled={date => date > new Date() || date < new Date("1900-01-01")}
                         locale={zhTW} // Ensure locale is passed
                         modifiers={{
                             calorieLogged: calorieLoggedDays,
                             waterLogged: waterLoggedDays,
                             selected: selectedDate ? [selectedDate] : [], // Ensure selected date is visually marked
                         }}
                         modifiersStyles={{
                             calorieLogged: { fontWeight: 'bold' },
                             waterLogged: { border: '1px solid hsl(var(--chart-2))', borderRadius: '50%' },
                             selected: { // Style for selected date
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'hsl(var(--primary-foreground))',
                             },
                         }}
                         captionLayout="dropdown-buttons" // Use dropdowns for month/year
                         fromYear={2020} // Example start year
                         toYear={new Date().getFullYear()} // Current year
                     />
                 )}
            </div>

             {/* Sorting Options (Monthly View Only) */}
             {logViewMode === 'monthly' && (
                 <div className="mb-4 flex justify-end">
                     <Select value={monthlySortCriteria} onValueChange={(value) => setMonthlySortCriteria(value as MonthlySortCriteria)}>
                         <SelectTrigger className="w-full sm:w-[180px]">
                             <ArrowDownUp size={16} className="mr-2"/>
                             <SelectValue placeholder="排序方式" />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="time-desc">時間 (最新優先)</SelectItem>
                             <SelectItem value="time-asc">時間 (最舊優先)</SelectItem>
                             <SelectItem value="calories-desc">卡路里 (高到低)</SelectItem>
                             <SelectItem value="calories-asc">卡路里 (低到高)</SelectItem>
                         </SelectContent>
                     </Select>
                 </div>
             )}


            {/* Log Entries */}
            {selectedDate && (
                <div>
                    <h3 className="text-lg font-medium mb-3 border-b pb-1 text-muted-foreground">
                         {logViewMode === 'daily'
                            ? `${format(selectedDate, 'yyyy 年 MM 月 dd 日', { locale: zhTW })} 的記錄`
                            : `${format(selectedDate, 'yyyy 年 MM 月', { locale: zhTW })} 的記錄`
                         }
                    </h3>
                    {filteredLog.length > 0 ? (
                        <div className="space-y-4">
                            {filteredLog.map(renderLogEntry)}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-6">
                            <UtensilsCrossed className="mx-auto h-10 w-10 opacity-40 mb-3" />
                             <p>
                                 {logViewMode === 'daily'
                                     ? '這天沒有記錄任何卡路里。'
                                     : '這個月沒有記錄任何卡路里。'
                                 }
                             </p>
                        </div>
                    )}
                </div>
            )}

            {/* Fallback if no date is selected (shouldn't happen with default) */}
            {!selectedDate && calorieLog.length > 0 && (
                 <div className="text-center text-muted-foreground py-6">
                     <p>請選擇一個日期或月份以查看記錄。</p>
                 </div>
            )}

             {/* Show initial message if no logs exist at all */}
             {calorieLog.length === 0 && (
                 <div className="text-center text-muted-foreground py-10 mt-6">
                     <UtensilsCrossed className="mx-auto h-12 w-12 opacity-50 mb-4" />
                     <p>尚未記錄任何卡路里。</p>
                     <p>使用上方的相機或上傳按鈕開始記錄！</p>
                 </div>
             )}
        </div>
    );
};

 // Helper function to render water entries list
 const renderWaterEntriesList = (entries: WaterLogEntry[]) => (
    <div className="space-y-2 pt-4 border-t">
        <h4 className="text-sm font-medium text-muted-foreground">今日飲水記錄：</h4>
        <ul className="max-h-40 overflow-y-auto space-y-1 pr-2">
            {entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(entry => (
                <li key={entry.id} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                    <span>{format(new Date(entry.timestamp), 'HH:mm')} - {entry.amount} 毫升</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteWaterEntry(entry.id)} aria-label="刪除此飲水記錄" disabled={!isClient}>
                        <Trash size={14} />
                    </Button>
                </li>
            ))}
        </ul>
    </div>
 );


 const renderWaterTracker = () => {
      // Get water entries for the selected date
     const selectedDateEntries = useMemo(() => {
         if (!isClient || !selectedDate) return [];
         const dateKey = format(selectedDate, 'yyyy-MM-dd');
         return waterLog[dateKey] || [];
     }, [waterLog, selectedDate, isClient]);

     return (
        <Card className="mt-6 shadow-md">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Droplet size={24} className="text-blue-500" /> 每日飲水追蹤 {selectedDate && `(${format(selectedDate, 'MM/dd')})`}
                </CardTitle>
                 <CardDescription>
                      {calculatedRecommendedWater !== null
                          ? `個人建議飲水量：${calculatedRecommendedWater} 毫升 (約 ${Math.ceil(calculatedRecommendedWater / 250)} 杯)`
                          : `建議飲水量：${defaultWaterTarget} 毫升 (約 ${Math.ceil(defaultWaterTarget / 250)} 杯 - 請完成個人資料以取得個人化建議)`
                      }
                      {userProfile.weight && <span className="text-xs"> (基於 {userProfile.weight} 公斤體重)</span>}
                 </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Progress and Total */}
                 <div className="space-y-2">
                    <Progress value={waterProgress} aria-label={`今日飲水進度 ${Math.round(waterProgress)}%`} className="h-3" />
                    <div className="text-center font-medium text-muted-foreground">
                        今日已喝： {selectedDateWaterIntake} / {currentRecommendedWater} 毫升 ({Math.round(waterProgress)}%)
                    </div>
                 </div>

                 {/* Add Water Section */}
                 <div className="flex flex-col sm:flex-row gap-2">
                     <Input
                         type="number"
                         placeholder="輸入水量 (毫升)"
                         value={customWaterAmount}
                         onChange={(e) => setCustomWaterAmount(e.target.value)}
                         min="1"
                         className="flex-grow"
                         disabled={!isClient}
                     />
                     <Button
                         onClick={() => addWater(parseInt(customWaterAmount, 10))}
                         disabled={!isClient || !customWaterAmount || parseInt(customWaterAmount, 10) <= 0}
                         className="w-full sm:w-auto"
                     >
                         <Plus className="mr-1 h-4 w-4" /> 新增飲水
                     </Button>
                 </div>

                 {/* Quick Add Buttons */}
                 <div className="flex justify-center gap-2 flex-wrap">
                    <Button onClick={() => addWater(250)} variant="outline" size="sm" disabled={!isClient}>
                        <Plus className="mr-1 h-4 w-4" /> 250ml (一杯)
                    </Button>
                    <Button onClick={() => addWater(500)} variant="outline" size="sm" disabled={!isClient}>
                        <Plus className="mr-1 h-4 w-4" /> 500ml (一瓶)
                    </Button>
                 </div>

                 {/* List of Today's Entries */}
                 {selectedDateEntries.length > 0 && renderWaterEntriesList(selectedDateEntries)}


                 {/* Reset Button */}
                 {selectedDateEntries.length > 0 && (
                     <div className="pt-4 border-t">
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                 <Button variant="destructive" size="sm" disabled={!isClient}>
                                   <RotateCw className="mr-1 h-4 w-4" /> 重設本日 ({format(selectedDate ?? new Date(), 'MM/dd')})
                                 </Button>
                             </AlertDialogTrigger>
                             <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>確定要重設 {format(selectedDate ?? new Date(), 'yyyy/MM/dd')} 的飲水量嗎？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        這將刪除所選日期的所有飲水記錄。此操作無法復原。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={resetTodaysWater}>
                                        確認重設
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                             </AlertDialogContent>
                         </AlertDialog>
                    </div>
                 )}

            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
                保持水分充足對健康至關重要！成人每日建議飲水 8 杯 (約 2000 毫升)。
            </CardFooter>
        </Card>
    );
 };

 // --- Achievement Logic ---

 // Check if photo was logged yesterday
 const yesterdayPhotoLogged = useMemo(() => {
    if (!isClient) return false;
    const yesterdayDate = subDays(new Date(), 1);
    return calorieLoggedDays.some(date => isSameDay(date, yesterdayDate));
 }, [calorieLoggedDays, isClient]);

 // --- End Achievement Logic ---


 // New function to render the achievement summary tab content
 const renderAchievementSummary = () => {
    const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const yesterdayTarget = calculateRecommendedWater({ ...userProfile, weight: userProfile.weight }) ?? defaultWaterTarget; // Recalculate target based on profile *at that time* might be complex, use current for simplicity

    const getWaterAchievementBadge = () => {
        if (yesterdayWaterGoalMet) {
            return (
                <div className="text-center">
                    <Cat size={60} className="mx-auto text-yellow-500 drop-shadow-lg" />
                    <p className="mt-2 font-semibold text-primary">水分充足貓！</p>
                    <p className="text-xs text-muted-foreground">昨天達成喝水目標！</p>
                </div>
            );
        } else {
             return (
                 <div className="text-center">
                     <Cat size={60} className="mx-auto text-muted-foreground opacity-50" />
                     <p className="mt-2 font-semibold text-muted-foreground">再接再厲貓</p>
                     <p className="text-xs text-muted-foreground">昨天未達成目標。今天加油！</p>
                 </div>
             );
        }
    };

     const getPhotoAchievementBadge = () => {
         if (yesterdayPhotoLogged) {
             return (
                 <div className="text-center">
                     <ImageIcon size={60} className="mx-auto text-green-500 drop-shadow-lg" />
                     <p className="mt-2 font-semibold text-primary">拍照記錄貓！</p>
                     <p className="text-xs text-muted-foreground">昨天有拍照記錄！</p>
                 </div>
             );
         } else {
             return (
                 <div className="text-center">
                     <ImageIcon size={60} className="mx-auto text-muted-foreground opacity-50" />
                     <p className="mt-2 font-semibold text-muted-foreground">害羞拍照貓</p>
                     <p className="text-xs text-muted-foreground">昨天沒有拍照記錄。</p>
                 </div>
             );
         }
     };

    return (
        <>
            {/* Water Achievement Card */}
            <Card className="mt-6 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trophy size={24} className="text-yellow-600" /> 飲水成就
                    </CardTitle>
                    <CardDescription>看看您昨天的喝水表現！</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 items-center">
                        {/* Yesterday's Water Stats */}
                        <div className="text-center border-r pr-4">
                             <p className="text-xs text-muted-foreground">昨日 ({format(subDays(new Date(), 1), 'MM/dd')})</p>
                            <p className="text-2xl font-bold text-blue-600">{yesterdayWaterIntake} <span className="text-sm font-normal">毫升</span></p>
                            <p className="text-xs text-muted-foreground">目標：{yesterdayTarget} 毫升</p>
                            <Progress
                               value={yesterdayTarget > 0 ? Math.min((yesterdayWaterIntake / yesterdayTarget) * 100, 100) : 0}
                               className="h-2 mt-2"
                               aria-label={`昨日飲水進度 ${Math.round(yesterdayTarget > 0 ? (yesterdayWaterIntake / yesterdayTarget) * 100 : 0)}%`}
                            />
                        </div>
                        {/* Water Achievement Badge */}
                        {getWaterAchievementBadge()}
                    </div>
                </CardContent>
                 <CardFooter className="text-xs text-muted-foreground">
                     持續追蹤，養成喝水好習慣！ <Cat size={14} className="inline-block ml-1 text-primary" />
                 </CardFooter>
            </Card>

             {/* Photo Logging Achievement Card */}
             <Card className="mt-6 shadow-md">
                 <CardHeader>
                     <CardTitle className="flex items-center gap-2">
                         <ImageIcon size={24} className="text-green-600" /> 拍照記錄成就
                     </CardTitle>
                     <CardDescription>看看您昨天的拍照記錄習慣！</CardDescription>
                 </CardHeader>
                 <CardContent>
                      <div className="grid grid-cols-2 gap-4 items-center">
                         {/* Yesterday's Photo Log Status */}
                         <div className="text-center border-r pr-4">
                             <p className="text-xs text-muted-foreground">昨日 ({format(subDays(new Date(), 1), 'MM/dd')})</p>
                              <p className={`text-2xl font-bold ${yesterdayPhotoLogged ? 'text-green-600' : 'text-muted-foreground'}`}>
                                 {yesterdayPhotoLogged ? '已記錄' : '未記錄'}
                              </p>
                              <p className="text-xs text-muted-foreground">目標：每日記錄</p>
                         </div>
                         {/* Photo Achievement Badge */}
                         {getPhotoAchievementBadge()}
                      </div>
                 </CardContent>
                 <CardFooter className="text-xs text-muted-foreground">
                     拍照記錄您的飲食，讓追蹤更輕鬆！ <Cat size={14} className="inline-block ml-1 text-primary" />
                 </CardFooter>
             </Card>
        </>
    );
 };


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
                  <span className="text-muted-foreground">{calculatedRecommendedWater ? `${calculatedRecommendedWater} 毫升` : 'N/A'}</span>
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
                             value={editingEntry.mealType || 'none'} // Use 'none' for null value
                             onValueChange={(value) => handleEditChange('mealType', value)}
                         >
                             <SelectTrigger id="edit-mealType" className="col-span-3">
                                 <SelectValue placeholder="選擇餐別 (選填)" />
                             </SelectTrigger>
                             <SelectContent>
                                  <SelectItem value="none">-- 無 --</SelectItem> {/* Option for null */}
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
                         value={userProfile.gender || 'none'} // Use 'none' for null value
                         onValueChange={(value) => handleProfileChange('gender', value)}
                         disabled={!isClient} // Disable on server
                      >
                         <SelectTrigger id="gender" aria-label="選取生理性別">
                             <SelectValue placeholder="選取生理性別" />
                         </SelectTrigger>
                         <SelectContent>
                              <SelectItem value="none">-- 未設定 --</SelectItem>
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
                         value={userProfile.activityLevel || 'none'} // Use 'none' for null value
                         onValueChange={(value) => handleProfileChange('activityLevel', value)}
                         disabled={!isClient} // Disable on server
                     >
                         <SelectTrigger id="activityLevel" aria-label="選取活動水平">
                             <SelectValue placeholder="選取您的活動水平" />
                         </SelectTrigger>
                         <SelectContent>
                              <SelectItem value="none">-- 未設定 --</SelectItem>
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
             <TabsList className="grid w-full grid-cols-4 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b"> {/* Changed to 4 columns */}
                 <TabsTrigger value="logging" className="flex-1 text-center px-1">
                     <Camera className="mr-1 sm:mr-2 h-4 w-4 inline-block" />
                     <span className="truncate hidden sm:inline">拍照記錄 & 摘要</span>
                     <span className="truncate sm:hidden">記錄</span>
                 </TabsTrigger>
                 <TabsTrigger value="tracking" className="flex-1 text-center px-1">
                     <Droplet className="mr-1 sm:mr-2 h-4 w-4 inline-block text-blue-500" />
                     <span className="truncate hidden sm:inline">飲水追蹤</span>
                     <span className="truncate sm:hidden">飲水</span>
                 </TabsTrigger>
                 {/* New Tab for Achievements */}
                 <TabsTrigger value="achievements" className="flex-1 text-center px-1"> {/* Changed value to "achievements" */}
                     <Trophy className="mr-1 sm:mr-2 h-4 w-4 inline-block text-yellow-600" />
                     <span className="truncate hidden sm:inline">每日成就</span> {/* Updated label */}
                     <span className="truncate sm:hidden">成就</span>
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
                         <CardTitle className="flex items-center gap-2">
                             {/* Changed text here */}
                             <Camera size={24} /> 點擊選擇上傳影像或拍攝照片
                         </CardTitle>
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

             {/* Tab 2: Water Tracking */}
            <TabsContent value="tracking" className="pt-4">
                {renderWaterTracker()}
            </TabsContent>

            {/* Tab 3: Achievements */}
            <TabsContent value="achievements" className="pt-4"> {/* Changed value to "achievements" */}
                 {renderAchievementSummary()}
            </TabsContent>

             {/* Tab 4: Settings */}
             <TabsContent value="settings" className="pt-4">
                 {renderProfileEditor()}
                 {renderProfileStats()} {/* Moved profile stats here */}
                 {renderNotificationSettingsTrigger()}
                 {/* Apple Health Integration Button moved here */}
                  <Button variant="outline" className="w-full mt-6" onClick={() => toast({ title: '尚未實作', description: 'Apple 健康整合即將推出！' })} disabled={!isClient}>
                      <Apple className="mr-2 h-4 w-4" /> 連接 Apple 健康
                  </Button>
             </TabsContent>
        </Tabs>

        {/* Render Modals outside TabsContent for proper stacking */}
        {renderEditDialog()}
        {renderImageModal()}
        {renderCropDialog()}
    </Dialog>
  );
}

