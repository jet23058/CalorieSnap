
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { estimateCalorieCount, type EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count'; // Type already includes isFoodItem
import useLocalStorage, { LocalStorageError } from '@/hooks/use-local-storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/loading-spinner';
import { Camera, Trash2, PlusCircle, UtensilsCrossed, X, MapPin, LocateFixed, DollarSign, Coffee, Sun, Moon, Apple, ImageOff, ImageUp, Crop, User, Activity, Weight, Ruler, BarChart3, Pencil, Save, Ban, GlassWater, Droplet, PersonStanding, CalendarDays, AlertCircle } from 'lucide-react'; // Added AlertCircle
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfDay, parseISO, isValid, isDate } from 'date-fns';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";


type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
const mealTypeTranslations: Record<MealType, string> = {
    Breakfast: '早餐',
    Lunch: '午餐',
    Dinner: '晚餐',
    Snack: '點心',
};

// Activity Level Types
type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';
const activityLevelTranslations: Record<ActivityLevel, string> = {
    sedentary: '久坐（很少或沒有運動）',
    lightly_active: '輕度活躍（輕度運動/運動 1-3 天/週）',
    moderately_active: '中度活躍（中度運動/運動 3-5 天/週）',
    very_active: '非常活躍（高強度運動/運動 6-7 天/週）',
};
const activityLevelMultipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
};

// Gender Types
type Gender = 'male' | 'female' | 'other';
const genderTranslations: Record<Gender, string> = {
    male: '男性',
    female: '女性',
    other: '其他',
};


// Interface for the data stored in localStorage - includes editable fields
// Note: The isFoodItem field from EstimateCalorieCountOutput is NOT stored in localStorage.
// It's used transiently after estimation.
interface LogEntryStorage extends Omit<EstimateCalorieCountOutput, 'foodItem' | 'calorieEstimate' | 'confidence' | 'isFoodItem'> {
  id: string;
  timestamp: number; // Editable timestamp (epoch ms)
  imageUrl: string;
  foodItem: string; // Editable food item name
  calorieEstimate: number; // Editable calorie estimate
  location?: string; // Optional location
  mealType?: MealType; // Meal type
  amount?: number; // Optional amount/cost
  confidence?: number; // Store confidence for reference, but not strictly required
}

// User Profile Interface
interface UserProfile {
    height?: number; // in cm
    weight?: number; // in kg
    age?: number; // in years
    gender?: Gender;
    activityLevel?: ActivityLevel;
    targetWaterIntake?: number; // in ml
}

// Daily Summary Interface
interface DailySummary {
    date: string; // YYYY-MM-DD
    totalCalories: number;
    totalAmount: number;
    totalWaterIntake: number; // Added water intake
    entries: LogEntryStorage[];
}

// Type for temporary edit data
type EditedEntryData = Partial<Pick<LogEntryStorage, 'foodItem' | 'calorieEstimate' | 'timestamp' | 'location' | 'mealType' | 'amount'>>;


// Compression settings
const IMAGE_MAX_WIDTH = 1024; // Max width for the compressed image
const IMAGE_QUALITY = 0.2; // JPEG quality (0 to 1)
const CROP_ASPECT = 16 / 9; // Aspect ratio for the crop tool


// Helper function to get cropped image data URL
function getCroppedImg(
  image: HTMLImageElement,
  crop: PixelCrop, // Use PixelCrop
  fileName: string = 'cropped-image.jpeg' // Optional filename
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const pixelRatio = window.devicePixelRatio || 1;

    canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return reject(new Error('無法取得畫布內容以裁切影像。'));
    }

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high';

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;

    const sourceX = cropX;
    const sourceY = cropY;
    const sourceWidth = crop.width * scaleX;
    const sourceHeight = crop.height * scaleY;

    const destX = 0;
    const destY = 0;
    const destWidth = crop.width * scaleX;
    const destHeight = crop.height * scaleY;


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
            destHeight,
        );
     } catch (e) {
        console.error("繪製裁切影像時發生錯誤:", e);
        return reject(new Error('繪製裁切影像時失敗。'));
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
           console.error("畫布轉換為 Blob 失敗");
           return reject(new Error('無法將裁切後的畫布轉換為影像。'));
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result as string);
        };
        reader.onerror = (error) => {
            console.error("讀取裁切後的 Blob 時發生錯誤:", error);
            reject(new Error('讀取裁切后的影像資料時失敗。'));
        };
        reader.readAsDataURL(blob);

      },
      'image/jpeg',
      IMAGE_QUALITY
    );
  });
}

// Mifflin-St Jeor Equation for BMR Calculation
const calculateBMR = (profile: UserProfile): number | null => {
    if (!profile.weight || !profile.height || !profile.age || !profile.gender) {
        return null; // Need weight, height, age, and gender
    }
    let bmr: number;
    if (profile.gender === 'male') {
        bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) + 5;
    } else if (profile.gender === 'female') {
        bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) - 161;
    } else {
        // For 'other', average male and female BMR as a rough estimate
        const bmrMale = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) + 5;
        const bmrFemale = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) - 161;
        bmr = (bmrMale + bmrFemale) / 2;
    }
    return Math.round(bmr);
};

// Calculate Estimated Daily Calorie Needs (TDEE)
const calculateEstimatedNeeds = (profile: UserProfile): number | null => {
    const bmr = calculateBMR(profile);
    if (bmr === null || !profile.activityLevel) {
        return null; // Need BMR and activity level
    }
    const multiplier = activityLevelMultipliers[profile.activityLevel];
    return Math.round(bmr * multiplier);
};

// Calculate Recommended Water Intake (Simple formula: 30-35ml per kg of body weight)
const calculateRecommendedWater = (weightKg?: number): number | null => {
    if (!weightKg) return null;
    // Using 35ml per kg as a general guideline
    return Math.round(weightKg * 35);
};

// Calculate BMI
const calculateBMI = (heightCm?: number, weightKg?: number): number | null => {
    if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
        return null;
    }
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);
    return parseFloat(bmi.toFixed(1)); // Return BMI rounded to one decimal place
};

// Format date/time for datetime-local input
const formatDateTimeLocal = (timestamp: number): string => {
  if (!timestamp || typeof timestamp !== 'number') return '';
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return ''; // Check if date is valid
    // Format: YYYY-MM-DDTHH:mm (seconds are usually not needed for this input)
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (e) {
    console.error("Error formatting timestamp:", e);
    return '';
  }
};

// Parse date/time from datetime-local input back to timestamp
const parseDateTimeLocal = (dateTimeString: string): number | null => {
  if (!dateTimeString) return null;
  try {
    const date = new Date(dateTimeString);
    if (!isValid(date)) return null; // Check if parsed date is valid
    return date.getTime();
  } catch (e) {
    console.error("Error parsing date/time string:", e);
    return null;
  }
};


export default function CalorieLogger() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null); // For cropper
  const [imageSrc, setImageSrc] = useState<string | null>(null); // For preview after crop/compress AND storing
  const [estimationResult, setEstimationResult] = useState<EstimateCalorieCountOutput | null>(null); // Type now includes isFoodItem
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [calorieLog, setCalorieLog, storageError] = useLocalStorage<LogEntryStorage[]>('calorieLog', []);
  const [userProfile, setUserProfile, profileStorageError] = useLocalStorage<UserProfile>('userProfile', {});
  const [waterLog, setWaterLog, waterStorageError] = useLocalStorage<Record<string, number>>('waterLog', {}); // Stores { 'YYYY-MM-DD': totalMl }
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  const [editedFoodItem, setEditedFoodItem] = useState<string>('');
  const [editedCalorieEstimate, setEditedCalorieEstimate] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [amount, setAmount] = useState<string>('');

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editedEntryData, setEditedEntryData] = useState<EditedEntryData>({});
  const [editedTimestampString, setEditedTimestampString] = useState<string>('');

  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  const [isClient, setIsClient] = useState(false);
  const logAttemptedRef = useRef(false); // Ref to track if log attempt was made

  const [waterAmountToAdd, setWaterAmountToAdd] = useState<string>('');
  const [currentWaterIntake, setCurrentWaterIntake] = useState<number>(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

   useEffect(() => {
     // Check for storage errors on client side and show toast
     if (storageError instanceof LocalStorageError) {
        toast({
            title: "記錄儲存錯誤",
            description: storageError.message,
            variant: "destructive",
            duration: 9000, // Show longer for critical errors
        });
        logAttemptedRef.current = false; // Reset flag if logging failed
     }
     if (profileStorageError instanceof LocalStorageError) {
        toast({
            title: "個人資料儲存錯誤",
            description: profileStorageError.message,
            variant: "destructive",
            duration: 7000,
        });
     }
      if (waterStorageError instanceof LocalStorageError) {
        toast({
            title: "飲水記錄儲存錯誤",
            description: waterStorageError.message,
            variant: "destructive",
            duration: 7000,
        });
     }
   }, [storageError, profileStorageError, waterStorageError, toast]);


  useEffect(() => {
    // Cleanup camera stream on component unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Update current water intake when water log changes
  useEffect(() => {
     if (!isClient) return; // Only run on client
     const todayDate = format(startOfDay(new Date()), 'yyyy-MM-dd');
     setCurrentWaterIntake(waterLog[todayDate] ?? 0);
  }, [waterLog, isClient]);

  // Calculate and sort daily summaries whenever logs change
  useEffect(() => {
    if (!isClient || !Array.isArray(calorieLog)) {
        setDailySummaries([]);
        return;
    }

    const summaries: { [date: string]: DailySummary } = {};

    // Process calorie log entries
    calorieLog.forEach(entry => {
       // Basic validation for entry structure
       if (!entry || typeof entry !== 'object' || !entry.timestamp || typeof entry.timestamp !== 'number') {
            console.warn("Skipping invalid log entry:", entry);
            return;
        }

       try {
           const entryDateObj = new Date(entry.timestamp);
           if (!isValid(entryDateObj)) {
                console.warn("Skipping log entry with invalid timestamp:", entry);
                return;
            }

            const entryDate = format(startOfDay(entryDateObj), 'yyyy-MM-dd');

            // Initialize summary for the date if it doesn't exist
            if (!summaries[entryDate]) {
                summaries[entryDate] = {
                    date: entryDate,
                    totalCalories: 0,
                    totalAmount: 0,
                    totalWaterIntake: waterLog[entryDate] ?? 0, // Get water intake for this day
                    entries: []
                };
            }

            // Safely add calories and amount
            const calories = typeof entry.calorieEstimate === 'number' && !isNaN(entry.calorieEstimate) ? entry.calorieEstimate : 0;
            const amountValue = typeof entry.amount === 'number' && !isNaN(entry.amount) ? entry.amount : 0;


            summaries[entryDate].totalCalories += calories;
            summaries[entryDate].totalAmount += amountValue;
            summaries[entryDate].entries.push(entry);

       } catch (dateError) {
           console.error("Error processing date for log entry:", entry, dateError);
       }
    });

     // Ensure days with only water intake are also included
     Object.keys(waterLog).forEach(waterDate => {
         if (!summaries[waterDate] && waterLog[waterDate] > 0) {
             summaries[waterDate] = {
                 date: waterDate,
                 totalCalories: 0,
                 totalAmount: 0,
                 totalWaterIntake: waterLog[waterDate],
                 entries: []
             };
         } else if (summaries[waterDate]) {
             // Ensure water intake is correctly reflected even if calorie entries exist
             summaries[waterDate].totalWaterIntake = waterLog[waterDate];
         }
     });

    // Sort entries within each summary by timestamp (descending)
    Object.values(summaries).forEach(summary => {
        summary.entries.sort((a, b) => {
            const timeA = typeof a.timestamp === 'number' ? a.timestamp : 0;
            const timeB = typeof b.timestamp === 'number' ? b.timestamp : 0;
            return timeB - timeA;
        });
    });

    // Sort summaries by date (descending)
    const sortedSummaries = Object.values(summaries).sort((a, b) => {
        // Simple string comparison works for 'yyyy-MM-dd' format
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return 0;
    });


    setDailySummaries(sortedSummaries);
  }, [calorieLog, waterLog, isClient]); // Recalculate when calorie or water log changes


  const fetchCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "地理位置錯誤",
        description: "您的瀏覽器不支援地理位置功能。",
        variant: "destructive",
      });
      return;
    }

    setIsFetchingLocation(true);
    setLocation('正在取得地點...'); // Provide feedback

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // For privacy, we just indicate "Current Location" instead of coordinates
        const locString = "目前位置"; // More descriptive
        setLocation(locString);
        setIsFetchingLocation(false);
        toast({
            title: "地點已取得",
            description: "已設定目前位置。",
        });
      },
      (geoError) => {
        // Log specific error details
        console.error(`取得地點時發生錯誤: ${geoError.message || 'No message'} (代碼: ${geoError.code || 'No code'})`, geoError);


        let description = "無法取得您的地點。";
        if (geoError.code === geoError.PERMISSION_DENIED) {
            description = "地點權限遭拒。請在瀏覽器設定中啟用。";
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
            description = "無法取得地點資訊。";
        } else if (geoError.code === geoError.TIMEOUT) {
            description = "取得使用者地點的要求已逾時。";
        }
        setLocation(''); // Clear location on error
        setIsFetchingLocation(false);
        toast({
          title: "地點錯誤",
          description: description,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options
    );
  }, [toast]); // Dependency: toast

 const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      setImageSrc(null);
      setOriginalImageSrc(null);
      clearEstimation();
      setCrop(undefined); // Reset crop state
      setCompletedCrop(undefined);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setOriginalImageSrc(result); // Set image for cropper
        setIsCropping(true); // Open the cropping dialog
         // Clear the file input value to allow re-uploading the same file
         if (fileInputRef.current) {
           fileInputRef.current.value = "";
         }
      };
      reader.onerror = (err) => {
          console.error("讀取檔案時發生錯誤:", err);
          setError("讀取影像檔案時失敗。");
          toast({
             title: "檔案錯誤",
             description: "無法讀取所選的影像檔案。",
             variant: "destructive",
          });
           // Clear input value even on error
           if (fileInputRef.current) {
               fileInputRef.current.value = "";
           }
      }
      reader.readAsDataURL(file);
    } else {
       // Clear input if no file selected (e.g., user cancelled)
       if (fileInputRef.current) {
           fileInputRef.current.value = "";
       }
    }
  };

  // Function called when image is loaded in the cropper
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
     if (width > 0 && height > 0) {
      // Center the initial crop to cover the whole image
      setCrop({
          unit: '%', // Use percentage units for flexibility
          width: 100,
          height: 100,
          x: 0,
          y: 0
      });
      // Also set initial completedCrop for potential immediate confirm
      setCompletedCrop({
          unit: 'px', // Pixel units are needed for getCroppedImg
          width: width,
          height: height,
          x: 0,
          y: 0
      });

     } else {
         console.warn("Image dimensions are zero on load, cannot set initial crop.");
         // Fallback crop if dimensions are zero
         setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
     }
  }

  const handleCropConfirm = async () => {
    if (completedCrop?.width && completedCrop?.height && imgRef.current && originalImageSrc) {
      // Ensure crop dimensions are valid
      if (completedCrop.width === 0 || completedCrop.height === 0) {
          toast({
              title: "裁切錯誤",
              description: "裁切區域的寬度或高度不能為零。",
              variant: "destructive",
          });
          return;
      }

      setIsLoading(true);
      setLoadingMessage('正在裁切並壓縮影像...');
      setIsCropping(false); // Close the dialog

      try {
        // Get the cropped image as a data URL (JPEG format with quality)
        const croppedDataUrl = await getCroppedImg(
          imgRef.current,
          completedCrop // Use the pixel crop directly
        );

        // Set the cropped/compressed image for preview and logging
        setImageSrc(croppedDataUrl);
        setOriginalImageSrc(null); // Clear the original image source
        setLoadingMessage('正在估計卡路里...'); // Update loading message
        await estimateCalories(croppedDataUrl); // Estimate calories on the cropped image

      } catch (cropError) {
        console.error("影像裁切失敗:", cropError);
        setError(`影像裁切失敗: ${cropError instanceof Error ? cropError.message : 'Unknown error'}`);
        toast({
          title: "處理錯誤",
          description: "無法裁切影像。請再試一次。",
          variant: "destructive",
        });
        setIsLoading(false);
        setOriginalImageSrc(null); // Clear original image source on error
      }
    } else {
        toast({
            title: "裁切錯誤",
            description: "請選取要裁切的區域，或等待影像載入完成。",
            variant: "destructive",
        });
    }
  };

  const handleCropCancel = () => {
    setIsCropping(false); // Close dialog
    setOriginalImageSrc(null); // Clear original image
    setCrop(undefined); // Reset crop state
    setCompletedCrop(undefined);
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Clear file input
    }
  };


  const openCamera = async () => {
    setError(null);
    setImageSrc(null);
    setOriginalImageSrc(null); // Ensure no image from previous upload remains
    clearEstimation();
    try {
      // Prefer environment-facing camera
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' } }
      };
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback to default camera if environment camera fails
        console.warn("Environment camera failed, trying default:", err);
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true'); // Important for iOS Safari
        // Attempt to play the video
        videoRef.current.play().catch(playError => {
            console.error("Video play failed:", playError);
             toast({
                title: "相機預覽錯誤",
                description: "無法啟動相機預覽。",
                variant: "destructive",
            });
        });
      }
      setIsCameraOpen(true);
    } catch (err) {
      console.error("存取相機時發生錯誤:", err);
       let errorMsg = "無法存取相機。請檢查權限。";
       if (err instanceof Error && err.name === 'NotAllowedError') {
         errorMsg = "相機權限遭拒。請在瀏覽器設定中啟用。";
       } else if (err instanceof Error && err.name === 'NotFoundError') {
            errorMsg = "找不到相機裝置。";
       } else if (err instanceof Error && err.name === 'NotReadableError') {
           // This can happen if the camera is already in use or due to hardware issues
           errorMsg = "相機目前正由其他應用程式使用中，或發生硬體錯誤。";
       }
      setError(errorMsg);
      toast({
        title: "相機錯誤",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };


  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop()); // Stop all tracks
    }
    setStream(null);
    setIsCameraOpen(false);
    // Clear video source to prevent frozen frame
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }
  };

 const takePicture = () => {
    // Ensure video, canvas, and video data are ready
    if (videoRef.current && canvasRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
      setIsLoading(true);
      setLoadingMessage('正在處理並壓縮影像...');
      setError(null);
      setImageSrc(null);
      setOriginalImageSrc(null); // Clear original image from potential previous upload
      clearEstimation();

      const video = videoRef.current;
      const canvas = canvasRef.current;

       // Use actual video dimensions for canvas size
       const videoWidth = video.videoWidth;
       const videoHeight = video.videoHeight;

       // Check if dimensions are valid before drawing
       if (videoWidth === 0 || videoHeight === 0) {
          console.error("Video dimensions are zero, cannot take picture yet.");
           toast({ title: "拍攝錯誤", description: "相機畫面尚未就緒。", variant: "destructive" });
           setIsLoading(false);
           return;
       }


      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to JPEG data URI with specified quality
        let dataUri: string;
        try {
           dataUri = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
             // Fallback for browsers that might not support jpeg canvas output well
             if (!dataUri || dataUri === 'data:,') {
                console.warn("toDataURL('image/jpeg') failed, falling back to png.");
                dataUri = canvas.toDataURL('image/png');
            }
        } catch (e) {
             console.error("Error creating data URL from canvas:", e);
             toast({ title: "拍攝錯誤", description: "無法處理拍攝的影像。", variant: "destructive" });
             closeCamera();
             setIsLoading(false);
             return;
        }


         // Validate the generated data URI
         if (!dataUri || dataUri === 'data:,') {
             console.error("Failed to get data URI from canvas.");
             toast({ title: "拍攝錯誤", description: "無法從相機擷取有效的影像。", variant: "destructive" });
             closeCamera();
             setIsLoading(false);
             return;
         }


        // Set the captured image, close camera, and start estimation
        setImageSrc(dataUri);
        closeCamera();
        setLoadingMessage('正在估計卡路里...');
        estimateCalories(dataUri);
      } else {
          setError("無法取得畫布內容。");
          toast({ title: "拍攝錯誤", description: "無法從相機拍攝影像。", variant: "destructive" });
          closeCamera();
          setIsLoading(false);
      }
    } else {
        // Provide more specific feedback if possible
        let errorMsg = "相機或畫布尚未就緒。";
        if (videoRef.current && videoRef.current.readyState < videoRef.current.HAVE_CURRENT_DATA) {
           errorMsg = "相機畫面仍在載入中。";
        }
        setError(errorMsg);
        toast({ title: "拍攝錯誤", description: errorMsg, variant: "destructive" });
        closeCamera(); // Close camera even if capture failed
        setIsLoading(false);
    }
  };


  // Clears estimation results and related fields
  const clearEstimation = () => {
     setEstimationResult(null);
     setError(null);
     setEditedFoodItem('');
     setEditedCalorieEstimate('');
     setLocation('');
     setMealType(undefined);
     setAmount('');
     setLoadingMessage('');
  }

  // Clears everything - image, estimation, camera
  const clearAll = () => {
      setImageSrc(null);
      setOriginalImageSrc(null);
      clearEstimation();
      setIsCameraOpen(false);
      closeCamera(); // Ensure camera is closed
       // Clear file input value
       if (fileInputRef.current) {
           fileInputRef.current.value = "";
       }
  }

  const estimateCalories = useCallback(async (photoDataUri: string) => {
    setLoadingMessage('正在估計卡路里...');
    setError(null);

    try {
      // Log image size for debugging potential issues
      const sizeInKB = (photoDataUri.length * (3/4)) / 1024; // Approximate size calculation
      console.log(`正在估計卡路里，壓縮後影像大小: ${sizeInKB.toFixed(1)} KB`);

      // Call the Genkit flow
      const result = await estimateCalorieCount({ photoDataUri });

      // Check if the result indicates it's not a food item
      if (!result.isFoodItem) {
         // Show a non-destructive warning toast
         toast({
            title: "非食物警告",
            description: `AI 辨識此影像為「${result.foodItem}」，可能不是食物。您可以繼續記錄，但卡路里預設為 0。`,
            variant: "default", // Use default variant for warning, not destructive
            duration: 7000, // Show longer
         });
         // Set calories to 0 for non-food items, keep the description
         setEstimationResult({ ...result, calorieEstimate: 0, confidence: 0 });
         setEditedFoodItem(result.foodItem); // Pre-fill with the description
         setEditedCalorieEstimate('0'); // Pre-fill calories as '0'
      } else {
          // Standard handling for food items
         setEstimationResult(result);
         setEditedFoodItem(result.foodItem);
         setEditedCalorieEstimate(result.calorieEstimate.toString());

         // Check confidence for food items and show toast if low
         if (result.confidence < 0.5) {
             toast({
              title: "低信賴度估計",
              description: "影像可能不清晰，或難以辨識食物品項。卡路里估計值可能較不準確。",
              variant: "default",
              duration: 5000,
            });
          }
      }

      // Attempt to fetch location after estimation
      fetchCurrentLocation();

    } catch (err) {
      console.error("估計卡路里時發生錯誤:", err);
      let errorMsg = "無法估計卡路里。請再試一次。";
      if (err instanceof Error) {
         // Provide more specific error messages based on common API errors
         if (err.message.includes("quota") || err.message.includes("size") || err.message.includes("payload")) {
            errorMsg = "無法估計卡路里。影像可能太大、無效，或發生網路問題。";
         } else if (err.message.includes("API key")) {
             errorMsg = "無法估計卡路里。API 設定錯誤。";
         } else {
             errorMsg = `無法估計卡路里: ${err.message}`;
         }
      }
      setError(errorMsg);
       toast({
        title: "估計失敗",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [toast, fetchCurrentLocation]); // Added fetchCurrentLocation dependency

  const logCalories = () => {
    logAttemptedRef.current = true; // Indicate an attempt to log

    // Basic validation before logging
    if (!editedFoodItem || !editedFoodItem.trim()) {
         toast({ title: "記錄錯誤", description: "項目名稱不可為空。", variant: "destructive" }); // Changed "食物品項" to "項目"
         logAttemptedRef.current = false; // Reset flag on validation failure
         return;
    }
    const parsedCalories = parseInt(editedCalorieEstimate, 10);
    if (isNaN(parsedCalories) || parsedCalories < 0) {
        toast({ title: "記錄錯誤", description: "請輸入有效的卡路里數值（非負整數）。", variant: "destructive" });
        logAttemptedRef.current = false;
        return;
    }
    const parsedAmount = amount === '' ? undefined : parseFloat(amount);
    if (amount !== '' && (parsedAmount === undefined || isNaN(parsedAmount) || parsedAmount < 0)) {
        toast({ title: "記錄錯誤", description: "請輸入有效的金額（非負數）。", variant: "destructive" });
        logAttemptedRef.current = false;
        return;
    }


    // Use imageSrc (the potentially cropped/compressed image)
    if (estimationResult && imageSrc) { // Check for estimationResult and imageSrc
      const newLogEntry: LogEntryStorage = {
        // Confidence might be 0 if not food, store it anyway or omit if preferred
        confidence: estimationResult.confidence,
        calorieEstimate: parsedCalories,
        foodItem: editedFoodItem.trim(), // Use the (potentially descriptive) name
        id: Date.now().toString(), // Unique ID based on timestamp
        timestamp: Date.now(), // Current timestamp for the log
        imageUrl: imageSrc, // Store the image data URI
        location: location || undefined, // Store location if available
        mealType: mealType, // Store meal type if selected
        amount: parsedAmount, // Store amount if entered
      };

      try {
        const MAX_LOG_ENTRIES = 100; // Limit the number of stored entries
        // Update the log state, adding the new entry and enforcing the limit
        setCalorieLog(prevLog => {
           // Ensure prevLog is an array
           const currentLog = Array.isArray(prevLog) ? prevLog : [];
           // Filter out any potential duplicate ID (unlikely but safe)
           const filteredLog = currentLog.filter(entry => entry.id !== newLogEntry.id);
           // Add new entry to the beginning and slice to maintain the limit
           return [newLogEntry, ...filteredLog].slice(0, MAX_LOG_ENTRIES);
        });
        // Success toast is handled by the useEffect watching calorieLog changes

      } catch (saveError) {
        // Catch errors specifically from setCalorieLog (though unlikely with state updates)
        console.error("Error explicitly caught while calling setCalorieLog:", saveError);
        logAttemptedRef.current = false; // Reset flag on save error
        if (saveError instanceof LocalStorageError) {
             // Show specific LocalStorageError message
             toast({
                title: "記錄儲存失敗",
                description: saveError.message,
                variant: "destructive",
                duration: 9000,
             });
        } else {
             // Show generic error for unexpected issues
             toast({
                title: "記錄儲存失敗",
                description: "儲存卡路里記錄時發生未預期的錯誤。",
                variant: "destructive",
             });
        }
      }

    } else {
         // Error if trying to log without necessary data
         let errorDesc = "沒有可記錄的估計結果或影像。";
         if (!imageSrc) {
             errorDesc = "缺少影像資料無法記錄。";
         }
         toast({
            title: "記錄錯誤",
            description: errorDesc,
            variant: "destructive",
         });
         logAttemptedRef.current = false; // Reset flag
    }
  };

   // Effect to show success toast after successful log and clear state
   useEffect(() => {
     if (!isClient || !logAttemptedRef.current) return; // Only run on client after a log attempt

     // Check if there was *no* storage error during the last attempt
     if (!storageError) {
       const lastEntry = calorieLog[0]; // Get the most recent entry
       // Simple check: if the last entry's timestamp is very recent, assume success
       // This avoids relying on potentially cleared state like editedFoodItem.
       if (lastEntry && (Date.now() - lastEntry.timestamp < 5000)) { // Check if logged within last 5 seconds
         toast({
           title: "記錄成功",
           description: `${lastEntry.foodItem} (${lastEntry.calorieEstimate} 大卡) 已新增至您的記錄中。`,
         });
         clearAll(); // Clear image, estimation, etc. after successful log
       }
     }
     // Reset the flag after checking, regardless of success/failure
     logAttemptedRef.current = false;

   }, [calorieLog, storageError, isClient, toast]); // Dependencies: log, error state, client status, toast


  const deleteLogEntry = (id: string) => {
    try {
        // Update state by filtering out the entry with the matching ID
        setCalorieLog(prevLog => {
           const currentLog = Array.isArray(prevLog) ? prevLog : [];
           return currentLog.filter(entry => entry.id !== id);
        });

         // Show success toast *if* the state update didn't cause a storage error
         // (This check relies on the useEffect handling storage errors)
         if (!storageError) {
            toast({
                title: "記錄項目已刪除",
                description: "所選項目已從您的記錄中移除。",
            });
         }
    } catch (deleteError) {
         // Catch potential errors during state update (less likely)
         console.error("Error explicitly caught while deleting log entry:", deleteError);
         if (deleteError instanceof LocalStorageError) {
              // Show specific storage error
              toast({ title: "刪除錯誤", description: deleteError.message, variant: "destructive", duration: 7000 });
         } else {
            // Show generic error
            toast({ title: "刪除錯誤", description: "刪除記錄項目時發生未預期的錯誤。", variant: "destructive" });
        }
    }
};

  // Function to initiate editing mode for a specific log entry
  const startEditing = (entry: LogEntryStorage) => {
    setEditingEntryId(entry.id);
    // Populate the temporary edit state with the entry's current values
    setEditedEntryData({
      foodItem: entry.foodItem,
      calorieEstimate: entry.calorieEstimate,
      timestamp: entry.timestamp,
      location: entry.location,
      mealType: entry.mealType,
      amount: entry.amount,
    });
    // Format the timestamp for the datetime-local input
    setEditedTimestampString(formatDateTimeLocal(entry.timestamp));
  };

  // Function to cancel the editing mode
  const cancelEditing = () => {
    setEditingEntryId(null); // Clear the ID of the entry being edited
    setEditedEntryData({}); // Clear the temporary edit data
    setEditedTimestampString(''); // Clear the formatted timestamp string
  };

  // Handles changes in the input fields during editing
  const handleEditInputChange = (field: keyof EditedEntryData, value: string | number | MealType | undefined) => {
    // Handle numeric fields (calories, amount) with specific parsing
    if (field === 'calorieEstimate') {
        // Allow empty string, otherwise parse as integer >= 0
        const numValue = value === '' ? undefined : parseInt(value as string, 10);
        setEditedEntryData(prev => ({ ...prev, [field]: (numValue !== undefined && !isNaN(numValue) && numValue >= 0) ? numValue : undefined }));
    } else if (field === 'amount') {
         // Allow empty string or decimal numbers >= 0
         const numValue = value === '' ? undefined : parseFloat(value as string);
         setEditedEntryData(prev => ({ ...prev, [field]: (value === '' || (numValue !== undefined && !isNaN(numValue) && numValue >= 0)) ? numValue : prev.amount }));
    }
    // Handle other fields (foodItem, location, mealType) directly
    else {
      setEditedEntryData(prev => ({ ...prev, [field]: value }));
    }
  };


  // Handles changes specifically for the datetime-local input
  const handleEditTimestampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTimestampString = e.target.value;
    setEditedTimestampString(newTimestampString); // Update the string state for the input
    const newTimestamp = parseDateTimeLocal(newTimestampString); // Parse the string into a numeric timestamp
    if (newTimestamp !== null) {
      // If parsing is successful, update the timestamp in the temporary edit data
      setEditedEntryData(prev => ({ ...prev, timestamp: newTimestamp }));
    } else {
      // If parsing fails (invalid date string), set timestamp to undefined to indicate an error state
      setEditedEntryData(prev => ({ ...prev, timestamp: undefined }));
    }
  };

  // Saves the edited log entry
  const saveEditedEntry = (id: string) => {
    const editedTimestamp = parseDateTimeLocal(editedTimestampString); // Parse the timestamp string

    // --- Validation ---
    if (!editedEntryData.foodItem || !editedEntryData.foodItem.trim()) {
        toast({ title: "儲存錯誤", description: "項目名稱不可為空。", variant: "destructive" }); // Changed "食物品項" to "項目"
        return;
    }
    const editedCalories = editedEntryData.calorieEstimate;
    if (editedCalories === undefined || isNaN(editedCalories) || editedCalories < 0) {
        toast({ title: "儲存錯誤", description: "請輸入有效的卡路里數值（非負數）。", variant: "destructive" });
        return;
    }
    if (editedTimestamp === null) {
        // This validation relies on handleEditTimestampChange setting timestamp to undefined on parse failure
        toast({ title: "儲存錯誤", description: "請輸入有效的日期和時間。", variant: "destructive" });
        return;
    }
     const editedAmount = editedEntryData.amount;
     if (editedAmount !== undefined && (isNaN(editedAmount) || editedAmount < 0)) {
         toast({ title: "儲存錯誤", description: "請輸入有效的金額（非負數）。", variant: "destructive" });
         return;
     }
    // --- End Validation ---

    try {
        // Update the main calorie log state
        setCalorieLog(prevLog => {
            const currentLog = Array.isArray(prevLog) ? prevLog : [];
            // Map through the log, find the entry by ID, and update its properties
            return currentLog.map(entry =>
                entry.id === id
                    ? {
                        ...entry, // Keep existing properties like imageUrl, confidence, id
                        // Update editable fields from the temporary edit state
                        foodItem: editedEntryData.foodItem!.trim(), // Ensure trimming
                        calorieEstimate: editedCalories,
                        timestamp: editedTimestamp, // Use the validated numeric timestamp
                        location: editedEntryData.location || undefined, // Use edited or clear if empty
                        mealType: editedEntryData.mealType, // Use edited meal type
                        amount: editedAmount, // Use edited amount (could be undefined)
                      }
                    : entry // Keep other entries unchanged
            );
        });

         // If no storage error occurred during the update...
         if (!storageError) {
            cancelEditing(); // Exit editing mode
            toast({
                title: "記錄已更新",
                description: "項目已成功更新。",
            });
         }
         // If a storage error *did* occur, the useEffect hook will show the error toast
    } catch (saveError) {
         // Catch unexpected errors during the state update itself (less likely)
         console.error("Error explicitly caught while saving edited entry:", saveError);
         if (saveError instanceof LocalStorageError) {
              toast({ title: "更新錯誤", description: saveError.message, variant: "destructive", duration: 7000 });
         } else {
             toast({ title: "更新錯誤", description: "更新記錄項目時發生未預期的錯誤。", variant: "destructive" });
         }
    }

  };

  // Adds a water intake amount for the current day
  const addWater = () => {
    const amountMl = parseInt(waterAmountToAdd, 10);
    // Validate the input amount
    if (isNaN(amountMl) || amountMl <= 0) {
      toast({ title: "輸入錯誤", description: "請輸入有效的飲水量 (毫升)。", variant: "destructive" });
      return;
    }

    const todayDate = format(startOfDay(new Date()), 'yyyy-MM-dd'); // Get today's date string

    try {
        // Update the water log state
        setWaterLog(prevLog => {
            // Ensure prevLog is a valid object
            const currentLog = typeof prevLog === 'object' && prevLog !== null ? prevLog : {};
            const newTotal = (currentLog[todayDate] ?? 0) + amountMl; // Add to existing total or start from 0
            return { ...currentLog, [todayDate]: newTotal }; // Update the entry for today
        });

         // If the update didn't cause a storage error...
         if (!waterStorageError) {
             const newTotalIntake = currentWaterIntake + amountMl; // Calculate new total *before* state update fully resolves
             setWaterAmountToAdd(''); // Clear the input field
             toast({
                 title: "飲水記錄成功",
                 description: `已新增 ${amountMl} 毫升飲水記錄。今日總計: ${newTotalIntake} 毫升。`,
             });
             // Manually update currentWaterIntake state to reflect the change immediately in the UI
             setCurrentWaterIntake(newTotalIntake);
         }
         // If a storage error occurred, the useEffect will handle the toast
    } catch (saveError) {
        // Catch unexpected errors during state update
        console.error("Error explicitly caught while saving water log:", saveError);
         if (saveError instanceof LocalStorageError) {
             toast({ title: "飲水記錄錯誤", description: saveError.message, variant: "destructive", duration: 7000 });
         } else {
            toast({ title: "飲水記錄錯誤", description: "儲存飲水記錄時發生未預期的錯誤。", variant: "destructive" });
         }
    }
  };



 // Handles changes in the user profile form fields
 const handleProfileChange = useCallback((field: keyof UserProfile, value: string | Gender | ActivityLevel | undefined) => {
     if (!isClient) return; // Only run on client

    setUserProfile(prev => {
        // Ensure the previous state is a valid object
        const currentProfile = typeof prev === 'object' && prev !== null ? prev : {};
        const newProfile = { ...currentProfile }; // Create a copy to modify
        let processedValue: number | Gender | ActivityLevel | undefined;

        // Process numeric fields (height, weight, age, targetWaterIntake)
        if (field === 'height' || field === 'weight' || field === 'age' || field === 'targetWaterIntake') {
            // Allow empty string (maps to undefined), otherwise parse as float >= 0
            const numValue = value === '' ? undefined : parseFloat(value as string);
            processedValue = numValue !== undefined && !isNaN(numValue) && numValue >= 0 ? numValue : undefined;
            // Ensure age and water intake are integers
            if (field === 'age' && processedValue !== undefined) {
                processedValue = Math.floor(processedValue);
            }
            if (field === 'targetWaterIntake' && processedValue !== undefined) {
                processedValue = Math.floor(processedValue);
            }
        }
        // Process activityLevel select field
        else if (field === 'activityLevel') {
            const validLevels = Object.keys(activityLevelTranslations);
            // Only set if the value is one of the valid activity levels
            processedValue = validLevels.includes(value as string) ? (value as ActivityLevel) : undefined;
        }
        // Process gender select field
        else if (field === 'gender') {
             const validGenders = Object.keys(genderTranslations);
             // Only set if the value is one of the valid genders
             processedValue = validGenders.includes(value as string) ? (value as Gender) : undefined;
        }
        // If the field is not recognized, return the previous state unchanged
        else {
             return prev;
        }

        // Only update the state if the processed value is different from the current value
        if (newProfile[field] !== processedValue) {
           newProfile[field] = processedValue;
           return newProfile; // Return the modified profile
        }
        return prev; // Return the previous state if no change occurred
    });
 }, [setUserProfile, isClient]); // Dependencies: setUserProfile function, isClient flag


  // Memoized calculations based on user profile
  const estimatedDailyNeeds = useMemo(() => calculateEstimatedNeeds(userProfile), [userProfile]);
  const basalMetabolicRate = useMemo(() => calculateBMR(userProfile), [userProfile]);
  const bodyMassIndex = useMemo(() => calculateBMI(userProfile.height, userProfile.weight), [userProfile.height, userProfile.weight]);
  const recommendedWater = useMemo(() => calculateRecommendedWater(userProfile.weight), [userProfile.weight]);


  // Triggers the hidden file input click event
  const triggerFileInput = () => {
     // Clear previous image/estimation state before opening file dialog
     setImageSrc(null);
     setOriginalImageSrc(null);
     clearEstimation();
    fileInputRef.current?.click();
  };

  // Helper to render meal type icon
  const renderMealIcon = (mealType?: MealType) => {
    switch (mealType) {
      case 'Breakfast': return <Coffee className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="早餐"/>;
      case 'Lunch': return <Sun className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="午餐"/>;
      case 'Dinner': return <Moon className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="晚餐"/>;
      case 'Snack': return <Apple className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="點心"/>;
      default: return null; // Return null if no meal type
    }
  };

  // Renders the estimation result card or loading/error states
  const renderEstimationResult = () => {
    // Show loading spinner while processing image or estimating
    if (isLoading && !estimationResult && !error) {
      return (
        <div className="flex flex-col items-center justify-center p-6 space-y-2">
          <LoadingSpinner size={32} />
          <p className="text-muted-foreground">{loadingMessage || '正在處理...'}</p>
        </div>
      );
    }

    // Show error card if estimation failed
    if (error && !estimationResult) {
      return (
         <Card className="border-destructive bg-destructive/10">
             <CardHeader>
                 <CardTitle className="text-destructive flex items-center gap-2"><X size={20}/> 估計錯誤</CardTitle>
             </CardHeader>
             <CardContent>
                <p className="text-destructive-foreground">{error}</p>
             </CardContent>
             <CardFooter>
                 {/* Button to clear the error and image */}
                 <Button variant="ghost" className="text-destructive-foreground underline" onClick={clearAll}>關閉</Button>
             </CardFooter>
         </Card>
      );
    }

    // Render the result card if estimation is complete
    if (estimationResult) {
      const isLikelyNotFood = !estimationResult.isFoodItem; // Check the flag from the API result

      return (
        <Card className={isLikelyNotFood ? "border-orange-400" : ""}> {/* Add orange border for non-food warning */}
          <CardHeader>
            <CardTitle>記錄詳細資訊</CardTitle>
             <CardDescription>記錄前請檢視並編輯詳細資訊。</CardDescription>
              {/* Warning Alert if AI thinks it's not food */}
             {isLikelyNotFood && (
                <Alert variant="orange" className="mt-2"> {/* Use the custom orange variant */}
                     <AlertCircle className="h-4 w-4" /> {/* Use AlertCircle icon */}
                    <AlertTitle className="font-semibold">非食物警告</AlertTitle>
                    <AlertDescription>
                        AI 認為這可能不是食物。卡路里預設為 0，但您仍可編輯並記錄。
                    </AlertDescription>
                </Alert>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Display the processed image */}
            {imageSrc && (
                <div className="relative aspect-video w-full overflow-hidden rounded-md border mb-4 bg-muted/30">
                  <Image
                    src={imageSrc}
                    alt="項目預覽" // Changed alt text to be more generic
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw" // Responsive image sizes
                    style={{ objectFit: 'contain' }} // Ensure image fits within bounds
                    data-ai-hint="食物 盤子 物件" // Added "物件" hint for potential AI image generation
                    className="rounded-md"
                    priority={true} // Prioritize loading this image as it's key content
                  />
                </div>
            )}

            {/* Editable Food Item Name */}
            <div className="space-y-1">
                <Label htmlFor="foodItem">項目名稱 <span className="text-destructive">*</span></Label> {/* Changed "食物品項" to "項目名稱" */}
                <Input
                    id="foodItem"
                    value={editedFoodItem}
                    onChange={(e) => setEditedFoodItem(e.target.value)}
                    placeholder={isLikelyNotFood ? "例如：一本書" : "例如：雞肉沙拉"} // Dynamic placeholder
                    aria-required="true"
                />
            </div>

             {/* Editable Calorie Estimate */}
             <div className="space-y-1">
                 <Label htmlFor="calorieEstimate">卡路里 (大卡) <span className="text-destructive">*</span></Label>
                 <Input
                     id="calorieEstimate"
                     type="number"
                     value={editedCalorieEstimate}
                     onChange={(e) => {
                         const val = e.target.value;
                         // Allow empty string or only digits
                         if (val === '' || /^\d+$/.test(val)) {
                             setEditedCalorieEstimate(val);
                         }
                     }}
                     placeholder="例如：350"
                     min="0" // Ensure non-negative
                     step="1" // Allow whole numbers
                     aria-required="true"
                     inputMode="numeric" // Hint for mobile keyboards
                 />
             </div>

             {/* Display AI Confidence Score */}
             <div className="flex justify-end text-sm pt-1">
                {/* Show confidence if it's a food item */}
                 {estimationResult.isFoodItem ? (
                     <p className={estimationResult.confidence < 0.7 ? 'text-orange-600' : 'text-muted-foreground'}>
                        <strong className="font-medium">AI 估計信賴度：</strong>
                        {Math.round(estimationResult.confidence * 100)}%
                         {/* Add "(低)" label for very low confidence */}
                         {estimationResult.confidence < 0.5 && <span className="ml-1 text-xs">(低)</span>}
                    </p>
                 ) : (
                     // Indicate no score if it wasn't considered food
                     <p className="text-muted-foreground italic">非食物品項，無信賴度評分。</p>
                 )}

            </div>

             <Separator className="my-3"/>

            {/* Location Input */}
            <div className="space-y-1">
                <Label htmlFor="location">地點</Label>
                 <div className="flex gap-2 items-center">
                    <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="例如：家裡、辦公室"
                        disabled={isFetchingLocation} // Disable while fetching
                         aria-label="輸入地點"
                    />
                    {/* Button to fetch current location */}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchCurrentLocation}
                        disabled={isFetchingLocation}
                        aria-label={isFetchingLocation ? "正在取得目前位置" : "取得目前位置"}
                        title={isFetchingLocation ? "正在取得..." : "取得目前位置"}
                        >
                        {isFetchingLocation ? <LoadingSpinner size={16}/> : <LocateFixed className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

             {/* Meal Type Selection */}
             <div className="space-y-1 pt-2">
                <Label>餐點類型 (選填)</Label>
                 <RadioGroup value={mealType} onValueChange={(value) => setMealType(value as MealType)} className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 sm:grid-cols-4">
                    {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as MealType[]).map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                        <RadioGroupItem value={type} id={`meal-${type}`} />
                        <Label htmlFor={`meal-${type}`} className="font-normal cursor-pointer flex items-center gap-1.5">
                            {renderMealIcon(type)} {mealTypeTranslations[type]}
                        </Label>
                    </div>
                    ))}
                </RadioGroup>
            </div>

            {/* Amount/Cost Input */}
            <div className="space-y-1 pt-2">
                <Label htmlFor="amount">金額 / 費用 (選填)</Label>
                <div className="relative">
                     <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="amount"
                        type="number"
                        value={amount}
                        onChange={(e) => {
                            const val = e.target.value;
                             // Allow empty string, positive decimals, or just a decimal point
                             if (val === '' || (/^\d*\.?\d*$/.test(val) && parseFloat(val) >= 0) || val === '.') {
                                setAmount(val);
                             }
                        }}
                        onBlur={(e) => {
                            // Format to 2 decimal places on blur if valid number
                            const num = parseFloat(e.target.value);
                            if (!isNaN(num) && num >= 0) {
                                setAmount(num.toFixed(2));
                            } else if (e.target.value !== '' && e.target.value !== '.') {
                                // Optionally clear invalid input on blur, or leave as is
                                // setAmount('');
                            } else if (e.target.value === '') {
                                setAmount(''); // Ensure empty string if cleared
                            }
                        }}

                        placeholder="0.00"
                        className="pl-8" // Padding left for the dollar icon
                        step="0.01" // Allow cents
                        min="0" // Non-negative
                        inputMode="decimal" // Hint for mobile keyboards
                         aria-label="輸入金額或費用"
                    />
                </div>
            </div>

          </CardContent>
          <CardFooter className="flex-col sm:flex-row gap-2 pt-4">
            {/* Log Button */}
            <Button
                onClick={logCalories}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto flex-1 sm:flex-none"
                 // Disable button based on validation criteria
                 disabled={
                    !editedFoodItem || !editedFoodItem.trim() || // Food item name required
                    editedCalorieEstimate === '' || isNaN(parseInt(editedCalorieEstimate)) || parseInt(editedCalorieEstimate) < 0 || // Valid calories required
                    (amount !== '' && (isNaN(parseFloat(amount)) || parseFloat(amount) < 0)) || // Valid amount if entered
                    isLoading || !imageSrc // Disable while loading or if no image
                 }
             >
              {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <PlusCircle className="mr-2 h-4 w-4" />}
               記錄卡路里
            </Button>
             {/* Cancel Button */}
             <Button variant="outline" onClick={clearAll} className="w-full sm:w-auto">
                取消
            </Button>
          </CardFooter>
        </Card>
      );
    }
    // Return null if no estimation result, error, or loading state applies
    return null;
  };


  // Renders a single log entry, handling both display and edit modes
  const renderLogEntry = (entry: LogEntryStorage) => {
    const isEditing = editingEntryId === entry.id; // Check if this entry is being edited
    // Safely get the timestamp, defaulting to now if invalid/missing (shouldn't happen with validation)
    const entryTimestamp = entry.timestamp && typeof entry.timestamp === 'number' ? entry.timestamp : Date.now();

    return (
        // Outer container for the entry
        <div className="flex items-start space-x-3 sm:space-x-4 py-3">
             {/* Image Thumbnail */}
             <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-md bg-muted border text-muted-foreground flex-shrink-0 overflow-hidden">
                {entry.imageUrl ? (
                    <Image
                        src={entry.imageUrl}
                        alt={`記錄項目：${entry.foodItem || '未知項目'}`} // Updated alt text
                        fill sizes="(max-width: 640px) 4rem, 5rem" // Responsive sizes
                        style={{ objectFit: 'cover' }} className="rounded-md" data-ai-hint="食物 盤子 物件" loading="lazy" // Lazy load images in the log
                        // Error handling for broken image links
                        onError={(e) => {
                            console.warn(`Error loading image for entry ${entry.id}`, e);
                             e.currentTarget.style.display = 'none'; // Hide the broken image
                             // Show the fallback icon
                             const parentDiv = e.currentTarget.parentElement;
                             if (parentDiv) {
                                 const fallbackIcon = parentDiv.querySelector('.fallback-icon');
                                 if (fallbackIcon) fallbackIcon.classList.remove('hidden');
                             }
                         }}
                    />
                ) : null }
                 {/* Fallback Icon (initially hidden if imageUrl exists) */}
                 <ImageOff size={32} aria-label="無可用影像" className={`fallback-icon ${entry.imageUrl ? 'hidden' : ''}`} />
            </div>

            {/* Entry Details (Display or Edit Form) */}
            <div className="flex-1 space-y-2 overflow-hidden min-w-0"> {/* min-w-0 prevents content from overflowing flex container */}
                {isEditing ? (
                    // --- Edit Mode ---
                    <>
                        {/* Edit Food Item Name */}
                        <div className="space-y-1">
                            <Label htmlFor={`edit-food-${entry.id}`}>項目名稱 <span className="text-destructive">*</span></Label> {/* Changed label */}
                            <Input id={`edit-food-${entry.id}`} value={editedEntryData.foodItem ?? ''}
                                   onChange={(e) => handleEditInputChange('foodItem', e.target.value)} placeholder="例如：雞肉沙拉" />
                        </div>
                         {/* Edit Calories */}
                         <div className="space-y-1">
                            <Label htmlFor={`edit-calories-${entry.id}`}>卡路里 (大卡) <span className="text-destructive">*</span></Label>
                            <Input id={`edit-calories-${entry.id}`} type="number" min="0" step="1" inputMode="numeric"
                                   value={editedEntryData.calorieEstimate ?? ''}
                                   onChange={(e) => handleEditInputChange('calorieEstimate', e.target.value)} placeholder="例如：350" />
                        </div>
                         {/* Edit Timestamp */}
                         <div className="space-y-1">
                             <Label htmlFor={`edit-timestamp-${entry.id}`}>日期與時間 <span className="text-destructive">*</span></Label>
                             <Input
                                 id={`edit-timestamp-${entry.id}`}
                                 type="datetime-local" // Use datetime-local input
                                 value={editedTimestampString} // Controlled input using formatted string
                                 onChange={handleEditTimestampChange} // Handle string changes and parsing
                                 max={formatDateTimeLocal(Date.now())} // Prevent future dates
                                 step="60" // Set step to minutes (optional)
                             />
                         </div>

                        {/* Edit Location */}
                        <div className="space-y-1">
                             <Label htmlFor={`edit-location-${entry.id}`}>地點</Label>
                             <Input id={`edit-location-${entry.id}`} value={editedEntryData.location ?? ''}
                                    onChange={(e) => handleEditInputChange('location', e.target.value)} placeholder="例如：家裡" />
                        </div>

                         {/* Edit Meal Type */}
                         <div className="space-y-1">
                             <Label>餐點類型</Label>
                             <RadioGroup value={editedEntryData.mealType} onValueChange={(value) => handleEditInputChange('mealType', value as MealType)} className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 sm:grid-cols-4">
                                 {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as MealType[]).map((type) => (
                                     <div key={type} className="flex items-center space-x-2">
                                         <RadioGroupItem value={type} id={`edit-meal-${entry.id}-${type}`} />
                                         <Label htmlFor={`edit-meal-${entry.id}-${type}`} className="font-normal cursor-pointer flex items-center gap-1.5">
                                             {renderMealIcon(type)} {mealTypeTranslations[type]}
                                         </Label>
                                     </div>
                                 ))}
                             </RadioGroup>
                         </div>

                        {/* Edit Amount */}
                        <div className="space-y-1">
                             <Label htmlFor={`edit-amount-${entry.id}`}>金額 / 費用</Label>
                             <div className="relative">
                                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input id={`edit-amount-${entry.id}`} type="number" step="0.01" min="0" className="pl-8"
                                    value={editedEntryData.amount ?? ''}
                                    onChange={(e) => handleEditInputChange('amount', e.target.value)} placeholder="0.00" />
                             </div>
                         </div>
                    </>
                ) : (
                    // --- Display Mode ---
                    <>
                        <p className="font-semibold text-base break-words">{entry.foodItem || '未知項目'}</p> {/* Use break-words for long names */}
                        <p className="text-sm text-primary">
                           {/* Safely display calories, showing '??' if invalid */}
                           {typeof entry.calorieEstimate === 'number' && !isNaN(entry.calorieEstimate) ? entry.calorieEstimate : '??'} 大卡
                        </p>
                        {/* Additional details (meal type, time, location, amount) */}
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            {/* Container for meal type and time */}
                            <div className="flex items-center flex-wrap gap-x-2"> {/* Allow wrapping */}
                                {/* Display meal type icon and name */}
                                {entry.mealType && mealTypeTranslations[entry.mealType] && (
                                    <div className="flex items-center">
                                        {renderMealIcon(entry.mealType)}
                                        <span>{mealTypeTranslations[entry.mealType]}</span>
                                    </div>
                                )}
                                {/* Display formatted timestamp */}
                                <span>
                                    {isValid(new Date(entryTimestamp)) ? format(new Date(entryTimestamp), 'yyyy/MM/dd HH:mm') : '無效時間'}
                                </span>
                            </div>
                            {/* Display location if available */}
                            {entry.location && (
                                <div className="flex items-center">
                                    <MapPin className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" />
                                    <span className="break-words">{entry.location}</span> {/* Allow location to wrap */}
                                </div>
                            )}
                            {/* Display amount if available and valid */}
                            {entry.amount !== undefined && entry.amount !== null && typeof entry.amount === 'number' && !isNaN(entry.amount) && (
                                <div className="flex items-center">
                                    <DollarSign className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" />
                                    <span>{entry.amount.toFixed(2)} 元</span>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Action Buttons (Edit/Delete or Save/Cancel) */}
            <div className="flex flex-col space-y-1 sm:space-y-2 shrink-0 self-start"> {/* shrink-0 prevents buttons from shrinking */}
                {isEditing ? (
                    // --- Buttons in Edit Mode ---
                    <>
                        <Button variant="ghost" size="icon" onClick={() => saveEditedEntry(entry.id)} className="text-primary hover:bg-primary/10 h-8 w-8" aria-label="儲存變更" title="儲存變更">
                            <Save className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={cancelEditing} className="text-muted-foreground hover:bg-muted/10 h-8 w-8" aria-label="取消編輯" title="取消編輯">
                            <Ban className="h-4 w-4" />
                        </Button>
                    </>
                ) : (
                    // --- Buttons in Display Mode ---
                    <>
                        <Button variant="ghost" size="icon" onClick={() => startEditing(entry)} className="text-muted-foreground hover:bg-muted/10 h-8 w-8" aria-label={`編輯 ${entry.foodItem || '項目'}`} title={`編輯 ${entry.foodItem || '項目'}`}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteLogEntry(entry.id)} className="text-destructive hover:bg-destructive/10 h-8 w-8" aria-label={`刪除 ${entry.foodItem || '項目'}`} title={`刪除 ${entry.foodItem || '項目'}`}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};


  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Left Column: Input Area */}
      <div className="md:w-1/2 space-y-6">
        {/* Card for Image Capture/Upload */}
        <Card>
          <CardHeader>
            <CardTitle>拍攝或上傳照片</CardTitle> {/* Changed title */}
            <CardDescription>使用相機或上傳圖片來估計卡路里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {/* Camera View */}
             {isCameraOpen && (
                <div className="relative">
                    {/* Video element for camera preview */}
                    <video ref={videoRef} playsInline muted className="w-full rounded-md border aspect-video object-cover bg-muted"></video>
                    {/* Capture Button */}
                    <Button
                        onClick={takePicture}
                        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 h-auto shadow-lg z-10 border-2 border-background"
                        aria-label="拍攝照片"
                        disabled={isLoading} // Disable while processing
                        >
                        <Camera size={24} />
                    </Button>
                     {/* Close Camera Button */}
                     <Button onClick={closeCamera} variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full z-10" aria-label="關閉相機">
                        <X size={18} />
                    </Button>
                </div>
            )}
            {/* Hidden canvas for processing camera image */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

             {/* Cropping Dialog */}
             <Dialog open={isCropping} onOpenChange={(open) => { if (!open) handleCropCancel(); }}> {/* Handle closing dialog */}
                  <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto"> {/* Allow scrolling for large images */}
                    <DialogHeader>
                      <DialogTitle>裁切影像</DialogTitle>
                      <DialogDescription>
                        拖曳選框以裁切您的照片。(預設為整張圖) {/* Changed description */}
                      </DialogDescription>
                    </DialogHeader>
                    {/* Image Cropper */}
                    {originalImageSrc && (
                        <div className="my-4 flex justify-center">
                            <ReactCrop
                                crop={crop}
                                onChange={(_, percentCrop) => setCrop(percentCrop)} // Update crop state during interaction
                                onComplete={(c) => setCompletedCrop(c)} // Update completed crop state when interaction ends
                                // aspect={CROP_ASPECT} // Optional: Enforce aspect ratio
                            >
                                <img
                                    ref={imgRef}
                                    alt="裁切預覽"
                                    src={originalImageSrc}
                                    onLoad={onImageLoad} // Set initial crop when image loads
                                    style={{ maxHeight: '60vh', objectFit: 'contain' }} // Limit preview height
                                    data-ai-hint="食物 盤子 物件" // Added "物件" hint
                                />
                            </ReactCrop>
                        </div>
                    )}
                     {/* Loading indicator if image is still loading */}
                     {!originalImageSrc && <p>正在載入影像...</p>}
                    <DialogFooter>
                       {/* Cancel Button */}
                       <DialogClose asChild>
                        <Button type="button" variant="outline" onClick={handleCropCancel}>
                            取消
                        </Button>
                       </DialogClose>
                      {/* Confirm Button */}
                      <Button type="button" onClick={handleCropConfirm} disabled={!completedCrop?.width || !completedCrop?.height || isLoading}>
                        {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <Crop className="mr-2 h-4 w-4" />}
                         確認裁切
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>


            {/* Image Preview (after capture/upload/crop, before logging) */}
            {!isCameraOpen && imageSrc && !estimationResult && !isLoading && !error && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted/30">
                 <Image
                    src={imageSrc}
                    alt="選取的項目" // Changed alt text
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    style={{ objectFit: 'contain' }}
                    data-ai-hint="食物 盤子 物件" // Added "物件" hint
                    className="rounded-md"
                    priority={true} // Load preview quickly
                />
                 {/* Clear Image Button */}
                 <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full" onClick={clearAll} aria-label="清除影像">
                    <X size={18} />
                </Button>
              </div>
            )}

             {/* Placeholder when no image/camera/estimation is active */}
             {!isCameraOpen && !imageSrc && !estimationResult && !isLoading && !error && !isCropping && (
                 <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-md text-muted-foreground bg-muted/50 p-4 text-center">
                     <ImageUp size={32} className="mb-2 opacity-50" />
                    <p>預覽畫面會顯示在此</p>
                     <p className="text-xs">開啟相機或上傳照片</p>
                 </div>
            )}

            {/* Buttons to open camera or upload */}
            {!isCameraOpen && !estimationResult && !isLoading && !error && !isCropping && (
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                    <Button onClick={openCamera} variant="outline" disabled={isLoading} className="w-full sm:w-auto">
                        <Camera className="mr-2 h-4 w-4" /> 開啟相機
                    </Button>
                    <Button onClick={triggerFileInput} variant="outline" disabled={isLoading} className="w-full sm:w-auto">
                        {imageSrc ? "更換照片" : "上傳照片"} {/* Dynamic button text */}
                    </Button>
                    {/* Hidden File Input */}
                    <Input
                        type="file"
                         accept="image/jpeg,image/png,image/webp,image/heic" // Specify accepted image types
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={isLoading}
                    />
                </div>
            )}

             {/* Loading indicator when processing */}
             {isLoading && !isCameraOpen && !isCropping && (
                <div className="flex flex-col items-center justify-center p-6 space-y-2">
                    <LoadingSpinner size={32} />
                    <p className="text-muted-foreground">{loadingMessage || '正在處理...'}</p>
                </div>
             )}
            {/* Error display below buttons */}
            {error && !estimationResult && !isCameraOpen && !isCropping && (
                 <div className="mt-4 p-3 border border-destructive bg-destructive/10 rounded-md text-destructive-foreground text-sm flex justify-between items-center">
                    <p>{error}</p>
                    {/* Button to dismiss error */}
                    <Button variant="ghost" size="sm" className="text-destructive-foreground underline p-0 h-auto hover:bg-transparent" onClick={clearAll}>關閉</Button>
                 </div>
             )}
          </CardContent>
        </Card>

        {/* Render Estimation Result Card (only when result exists or error occurred after image processing) */}
        { (estimationResult || (error && imageSrc)) && !isCameraOpen && !isCropping && renderEstimationResult()}

        {/* Card for Daily Water Tracking */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><GlassWater size={20} /> 每日飲水追蹤</CardTitle>
                <CardDescription>記錄您今天喝了多少水。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Display water storage error if any */}
                {waterStorageError && (
                     <Alert variant="destructive">
                         <AlertTitle>飲水記錄錯誤</AlertTitle>
                         <AlertDescription>{waterStorageError.message}</AlertDescription>
                     </Alert>
                 )}
                {/* Input and Button to add water */}
                <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                        <Label htmlFor="waterAmount">新增飲水量 (毫升)</Label>
                        <Input
                            id="waterAmount"
                            type="number"
                            value={waterAmountToAdd}
                            onChange={(e) => {
                                const val = e.target.value;
                                // Allow empty or positive integers
                                if (val === '' || (/^\d+$/.test(val) && parseInt(val) >= 0)) {
                                    setWaterAmountToAdd(val);
                                }
                            }}
                            placeholder="例如：250"
                            min="0"
                            step="50" // Suggest increments of 50ml
                            inputMode="numeric"
                            aria-label="輸入飲水量（毫升）"
                        />
                    </div>
                    <Button onClick={addWater} disabled={!waterAmountToAdd || parseInt(waterAmountToAdd) <= 0}>
                         <PlusCircle className="mr-2 h-4 w-4" /> 新增
                    </Button>
                </div>
                {/* Display current intake and progress */}
                <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">今日已喝：</span>
                        <span className="font-medium text-primary">{currentWaterIntake} 毫升</span>
                    </div>
                     {/* Show progress bar if target or recommendation exists */}
                     {(userProfile.targetWaterIntake !== undefined && userProfile.targetWaterIntake > 0) || (recommendedWater !== null && recommendedWater > 0) ? (
                         <>
                             <Progress
                                // Calculate progress based on target or recommendation
                                value={(currentWaterIntake / (userProfile.targetWaterIntake ?? recommendedWater ?? 1)) * 100}
                                className="h-2"
                                aria-label={`飲水進度 ${Math.round((currentWaterIntake / (userProfile.targetWaterIntake ?? recommendedWater ?? 1)) * 100)}%`}
                            />
                             <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>0 毫升</span>
                                <span>
                                    目標：{userProfile.targetWaterIntake ?? recommendedWater ?? 'N/A'} 毫升
                                    {/* Indicate if the target is a recommendation */}
                                    {!userProfile.targetWaterIntake && recommendedWater && " (建議)"}
                                </span>
                             </div>
                         </>
                     ) : (
                         // Prompt user to enter data for progress
                         <p className="text-xs text-muted-foreground text-center">輸入體重或設定目標以查看進度。</p>
                     )}
                </div>

            </CardContent>
        </Card>


        {/* Card for User Profile and Stats */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><User size={20}/> 您的個人資料 & 統計</CardTitle>
                <CardDescription>輸入您的資訊以估算每日需求。(資料儲存在您的瀏覽器中)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Display profile storage error */}
                {profileStorageError && (
                     <Alert variant="destructive">
                         <AlertTitle>個人資料儲存錯誤</AlertTitle>
                         <AlertDescription>{profileStorageError.message}</AlertDescription>
                     </Alert>
                 )}

                {/* Profile Input Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Height */}
                    <div className="space-y-1">
                        <Label htmlFor="height" className="flex items-center gap-1"><Ruler size={14}/> 身高 (公分)</Label>
                        <Input
                            id="height"
                            type="number"
                            value={userProfile?.height ?? ''}
                            onChange={(e) => handleProfileChange('height', e.target.value)}
                            placeholder="例如：175"
                            min="0"
                            aria-label="輸入身高（公分）"
                        />
                    </div>
                    {/* Weight */}
                    <div className="space-y-1">
                        <Label htmlFor="weight" className="flex items-center gap-1"><Weight size={14}/> 體重 (公斤)</Label>
                        <Input
                            id="weight"
                            type="number"
                            value={userProfile?.weight ?? ''}
                            onChange={(e) => handleProfileChange('weight', e.target.value)}
                            placeholder="例如：70"
                            min="0"
                            step="0.1" // Allow decimals for weight
                            aria-label="輸入體重（公斤）"
                        />
                    </div>
                     {/* Age */}
                     <div className="space-y-1">
                        <Label htmlFor="age" className="flex items-center gap-1"><CalendarDays size={14}/> 年齡 (歲)</Label>
                        <Input
                            id="age"
                            type="number"
                            value={userProfile?.age ?? ''}
                            onChange={(e) => handleProfileChange('age', e.target.value)}
                            placeholder="例如：30"
                            min="0"
                            step="1" // Whole numbers for age
                            aria-label="輸入年齡（歲）"
                        />
                    </div>
                     {/* Gender */}
                     <div className="space-y-1">
                         <Label htmlFor="gender" className="flex items-center gap-1"><PersonStanding size={14}/> 性別</Label>
                        <Select
                            value={userProfile?.gender || ''}
                            onValueChange={(value) => handleProfileChange('gender', value as Gender | undefined)}
                        >
                            <SelectTrigger id="gender" aria-label="選取生理性別">
                                <SelectValue placeholder={isClient ? "選取您的生理性別" : undefined}>
                                  {/* Display selected gender translation or placeholder */}
                                  {userProfile?.gender ? genderTranslations[userProfile.gender] : (isClient ? "選取您的生理性別" : null)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(genderTranslations).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                 {/* Activity Level */}
                 <div className="space-y-1">
                    <Label htmlFor="activityLevel" className="flex items-center gap-1"><Activity size={14}/> 活動水平</Label>
                    <Select
                        value={userProfile?.activityLevel || ''}
                        onValueChange={(value) => handleProfileChange('activityLevel', value as ActivityLevel | undefined)}
                    >
                        <SelectTrigger id="activityLevel" aria-label="選取活動水平">
                           <SelectValue placeholder={isClient ? "選取您的活動水平" : undefined}>
                              {/* Display selected activity level translation or placeholder */}
                              {userProfile?.activityLevel ? activityLevelTranslations[userProfile.activityLevel] : (isClient ? "選取您的活動水平" : null)}
                           </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(activityLevelTranslations).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                 {/* Target Water Intake */}
                 <div className="space-y-1">
                    <Label htmlFor="targetWaterIntake" className="flex items-center gap-1"><Droplet size={14}/> 每日目標飲水量 (毫升)</Label>
                    <Input
                        id="targetWaterIntake"
                        type="number"
                        value={userProfile?.targetWaterIntake ?? ''}
                        onChange={(e) => handleProfileChange('targetWaterIntake', e.target.value)}
                        placeholder={`例如：${recommendedWater ?? 2000}`} // Suggest recommended or default
                        min="0"
                        step="100" // Allow increments of 100ml
                        aria-label="輸入每日目標飲水量（毫升）"
                    />
                    {/* Show recommendation if target is not set */}
                    {recommendedWater && userProfile.targetWaterIntake === undefined && (
                        <p className="text-xs text-muted-foreground pt-1">根據您的體重，建議每日飲用約 {recommendedWater} 毫升。</p>
                    )}
                </div>

                <Separator className="my-4"/>

                 {/* Calculated Stats Display */}
                 <div className="grid grid-cols-2 gap-4 text-center">
                     {/* BMI */}
                     <div className="space-y-1 p-3 rounded-md border bg-muted/30">
                         <p className="text-xs text-muted-foreground">BMI</p>
                         <p className="text-2xl font-semibold text-foreground">{bodyMassIndex ?? '--'}</p>
                     </div>
                     {/* BMR */}
                     <div className="space-y-1 p-3 rounded-md border bg-muted/30">
                         <p className="text-xs text-muted-foreground">基礎代謝率 (BMR)</p>
                         <p className="text-2xl font-semibold text-foreground">{basalMetabolicRate ?? '--'}</p>
                         <p className="text-xs text-muted-foreground">大卡/日</p>
                     </div>
                 </div>
                {/* TDEE (Estimated Daily Needs) */}
                {estimatedDailyNeeds !== null && (
                    <div className="pt-3 text-sm text-muted-foreground text-center border-t mt-4">
                        估計每日總熱量消耗 (TDEE): <strong className="text-primary">{estimatedDailyNeeds} 大卡</strong>
                         <p className="text-xs">(此為粗略估計，僅供參考)</p>
                    </div>
                )}

                 {/* Placeholder for Apple Health Integration */}
                 <Button variant="outline" disabled className="w-full mt-4">
                     {/* Placeholder Icon */}
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2"><path d="M12.001 4.5a.75.75 0 01.75.75v1.502a.75.75 0 01-1.5 0V5.25a.75.75 0 01.75-.75zM12 9a.75.75 0 01.75.75v5.495a.75.75 0 01-1.5 0V9.75A.75.75 0 0112 9zm8.036 1.41l1.83 1.22-.001.001A11.95 11.95 0 0112 21.75c-2.672 0-5.153-.873-7.16-2.34l-.005-.003-1.83-1.22a.75.75 0 11.9-1.2l1.83 1.22a10.45 10.45 0 0012.46 0l1.83-1.22a.75.75 0 01.9 1.2zM12 2.25C6.34 2.25 1.75 6.84 1.75 12.5S6.34 22.75 12 22.75 22.25 18.16 22.25 12.5 17.66 2.25 12 2.25zm0 1.5a8.75 8.75 0 100 17.5 8.75 8.75 0 000-17.5z" clipRule="evenodd"></path></svg>
                     連接 Apple 健康 (開發中)
                 </Button>
                 <p className="text-xs text-muted-foreground text-center mt-1">Apple 健康整合需要特定的權限和設定。</p>
            </CardContent>
        </Card>

      </div>

      {/* Right Column: Log Summary */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 size={20}/> 您的記錄摘要</CardTitle>
             <CardDescription>
                最近記錄的項目摘要。
                {/* Display storage error message if present */}
                {(storageError || waterStorageError) && (
                     <span className="text-destructive ml-2">
                         (儲存錯誤: {storageError?.message || waterStorageError?.message})
                     </span>
                 )}
             </CardDescription>

          </CardHeader>
          <CardContent>
             {/* Scrollable area for the log */}
             <ScrollArea className="h-[calc(100vh-15rem)] min-h-[300px] pr-3"> {/* Adjusted height */}
              {/* Skeleton loading state before client-side hydration */}
              {!isClient ? (
                 <div className="space-y-6">
                     {[...Array(2)].map((_, index) => ( // Show 2 skeleton summaries
                        <Card key={index} className="p-4">
                            <Skeleton className="h-5 w-1/3 mb-3 rounded" /> {/* Date Skeleton */}
                             {/* Summary Stats Skeleton */}
                             <div className="grid grid-cols-3 gap-2 mb-3">
                                <Skeleton className="h-4 w-full rounded" />
                                <Skeleton className="h-4 w-full rounded" />
                                <Skeleton className="h-4 w-full rounded" />
                             </div>
                             {/* Log Entry Skeletons */}
                             {[...Array(2)].map((_, entryIndex) => ( // Show 2 skeleton entries per summary
                                 <div key={entryIndex} className="flex items-start space-x-4 py-2 border-t border-border/50">
                                    <Skeleton className="w-16 h-16 rounded-md flex-shrink-0" /> {/* Image Skeleton */}
                                    <div className="flex-1 space-y-2"> {/* Details Skeleton */}
                                        <Skeleton className="h-4 w-3/4 rounded" />
                                        <Skeleton className="h-4 w-1/4 rounded" />
                                        <Skeleton className="h-3 w-1/2 rounded" />
                                        <Skeleton className="h-3 w-2/3 rounded" />
                                    </div>
                                    <Skeleton className="w-8 h-8 rounded-full" /> {/* Button Skeleton */}
                                 </div>
                             ))}
                        </Card>
                     ))}
                 </div>
              ) : dailySummaries.length === 0 ? (
                 // Empty state if no log entries exist
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 pt-16">
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">您的記錄是空的</p>
                    <p>拍下食物照片或記錄飲水開始吧！</p>
                </div>
              ) : (
                // Accordion for displaying daily summaries
                <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="item-0"> {/* Default open first item */}
                   {dailySummaries.map((summary, index) => {
                       // Safely parse the summary date string
                       let summaryDate: Date | null = null;
                       try {
                           summaryDate = parseISO(summary.date); // Assumes 'yyyy-MM-dd' format
                           if (!isValid(summaryDate)) {
                              console.warn(`Invalid date string in summary: ${summary.date}`);
                              summaryDate = null; // Handle invalid dates
                           }
                       } catch (e) {
                           console.error(`Error parsing date string in summary: ${summary.date}`, e);
                           summaryDate = null;
                       }

                       return (
                           <AccordionItem key={summary.date} value={`item-${index}`}>
                             <Card className="overflow-hidden"> {/* Prevent content overflow */}
                                <AccordionTrigger className="px-4 py-3 hover:no-underline bg-muted/50">
                                  {/* Header row for the summary */}
                                  <div className="flex justify-between items-center w-full gap-4">
                                    {/* Formatted Date */}
                                    <span className="font-semibold text-base whitespace-nowrap">
                                      {summaryDate ? format(summaryDate, 'yyyy年MM月dd日') : '無效日期'}
                                    </span>
                                    {/* Daily Totals (Calories, Amount, Water) */}
                                    <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm text-right flex-shrink-0">
                                      {/* Total Calories */}
                                      <p className="text-primary whitespace-nowrap">
                                         {typeof summary.totalCalories === 'number' && !isNaN(summary.totalCalories) ? summary.totalCalories.toFixed(0) : '??'} 大卡
                                      </p>
                                      {/* Total Amount (only if > 0) */}
                                      {summary.totalAmount > 0 && typeof summary.totalAmount === 'number' && !isNaN(summary.totalAmount) ? (
                                          <p className="text-muted-foreground whitespace-nowrap">{summary.totalAmount.toFixed(2)} 元</p>
                                      ) : ( <span />) /* Placeholder if no amount */}
                                       {/* Total Water Intake */}
                                       <p className="text-blue-600 whitespace-nowrap">
                                           <Droplet size={12} className="inline mr-0.5"/>
                                          {typeof summary.totalWaterIntake === 'number' && !isNaN(summary.totalWaterIntake) ? summary.totalWaterIntake : 0} 毫升
                                       </p>
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                {/* Content of the accordion item (log entries for the day) */}
                                <AccordionContent className="border-t border-border max-h-[50vh] overflow-y-auto"> {/* Scrollable content */}
                                   {summary.entries.length > 0 ? (
                                      <div className="p-2 sm:p-4 divide-y divide-border"> {/* Add dividers between entries */}
                                        {summary.entries.map((entry) => (
                                            <React.Fragment key={entry.id}>
                                               {renderLogEntry(entry)} {/* Render each entry */}
                                            </React.Fragment>
                                        ))}
                                      </div>
                                   ) : (
                                       // Message if no food logged for the day (but water might exist)
                                       <p className="p-4 text-sm text-muted-foreground text-center">本日無食物記錄。</p>
                                   )}
                                </AccordionContent>
                             </Card>
                           </AccordionItem>
                       );
                   })}
                </Accordion>

              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

