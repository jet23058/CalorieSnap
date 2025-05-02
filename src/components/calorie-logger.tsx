

"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { estimateCalorieCount, type EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count';
import useLocalStorage, { LocalStorageError } from '@/hooks/use-local-storage'; // Import LocalStorageError
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
import { Camera, Trash2, PlusCircle, UtensilsCrossed, X, MapPin, LocateFixed, DollarSign, Coffee, Sun, Moon, Apple, ImageOff, ImageUp, Crop, User, Activity, Weight, Ruler, BarChart3, Pencil, Save, Ban } from 'lucide-react'; // Added ImageUp, Crop, User, Activity, Weight, Ruler, BarChart3, Pencil, Save, Ban
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog'; // Import Dialog components including DialogDescription
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop'; // Import react-image-crop
import 'react-image-crop/dist/ReactCrop.css'; // Import css styles for react-image-crop
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton for placeholder
import { format, startOfDay, parseISO, isValid, isDate } from 'date-fns'; // Import date-fns functions, add isValid, isDate
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"; // Import Alert


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


// Interface for the data stored in localStorage - includes editable fields
interface LogEntryStorage extends Omit<EstimateCalorieCountOutput, 'foodItem' | 'calorieEstimate'> {
  id: string;
  timestamp: number; // Editable timestamp (epoch ms)
  imageUrl: string;
  foodItem: string; // Editable food item name
  calorieEstimate: number; // Editable calorie estimate
  location?: string; // Optional location
  mealType?: MealType; // Meal type
  amount?: number; // Optional amount/cost
}

// User Profile Interface
interface UserProfile {
    height?: number; // in cm
    weight?: number; // in kg
    activityLevel?: ActivityLevel;
    // Add gender and age later if needed for more accurate calculations
}

// Daily Summary Interface
interface DailySummary {
    date: string; // YYYY-MM-DD
    totalCalories: number;
    totalAmount: number;
    entries: LogEntryStorage[];
}

// Type for temporary edit data
type EditedEntryData = Partial<Pick<LogEntryStorage, 'foodItem' | 'calorieEstimate' | 'timestamp' | 'location' | 'mealType' | 'amount'>>;


// Compression settings
const IMAGE_MAX_WIDTH = 1024; // Max width for the compressed image
const IMAGE_QUALITY = 0.2; // JPEG quality (0 to 1) - Changed from 0.6 to 0.2
const CROP_ASPECT = 16 / 9; // Aspect ratio for the crop tool

// Helper function for centering the crop - NOT USED FOR INITIAL CROP ANYMORE
// function centerAspectCrop(
//   mediaWidth: number,
//   mediaHeight: number,
//   aspect: number,
// ): CropType {
//   return centerCrop(
//     makeAspectCrop(
//       {
//         unit: '%',
//         width: 90, // Start with 90% width crop
//       },
//       aspect,
//       mediaWidth,
//       mediaHeight,
//     ),
//     mediaWidth,
//     mediaHeight,
//   );
// }

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
    // devicePixelRatio slightly increases sharpness on retina devices
    // but can increase file size. Remove if not needed.
    const pixelRatio = window.devicePixelRatio || 1;

    canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return reject(new Error('無法取得畫布內容以裁切影像。'));
    }

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high'; // Or 'medium' or 'low'

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


    // Correctly draw the cropped portion
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

    // Get the data URL
    // Use 'image/jpeg' and quality for compression at this stage too
    canvas.toBlob(
      (blob) => {
        if (!blob) {
           console.error("畫布轉換為 Blob 失敗");
           return reject(new Error('無法將裁切後的畫布轉換為影像。'));
        }
        // Convert blob to data URL
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
      'image/jpeg', // Use JPEG for better compression than PNG
      IMAGE_QUALITY // Use the same quality setting
    );
  });
}

// Simple BMR Calculation (Mifflin-St Jeor Equation - Simplified, assumes age 30, male for demo)
// A real app should ask for age and gender.
const calculateEstimatedNeeds = (profile: UserProfile): number | null => {
    if (!profile.weight || !profile.height || !profile.activityLevel) {
        return null; // Not enough info
    }
    // Simplified: Using male formula and assuming age 30
    // BMR = (10 * weight in kg) + (6.25 * height in cm) - (5 * age) + 5
    const age = 30; // Assumption
    const bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * age) + 5;
    const multiplier = activityLevelMultipliers[profile.activityLevel];
    return Math.round(bmr * multiplier);
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
  const [estimationResult, setEstimationResult] = useState<EstimateCalorieCountOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>(''); // For specific loading messages
  const [error, setError] = useState<string | null>(null);
  // Use the storage-specific type for localStorage
  // Destructure error from the hook
  const [calorieLog, setCalorieLog, storageError] = useLocalStorage<LogEntryStorage[]>('calorieLog', []);
  const [userProfile, setUserProfile, profileStorageError] = useLocalStorage<UserProfile>('userProfile', {});
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]); // State for daily summaries

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Used for taking picture
  const imgRef = useRef<HTMLImageElement>(null); // Ref for the image in the cropper
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  // State for editable fields (during logging)
  const [editedFoodItem, setEditedFoodItem] = useState<string>('');
  const [editedCalorieEstimate, setEditedCalorieEstimate] = useState<string>(''); // Editable calories before logging, use string for input
  const [location, setLocation] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [amount, setAmount] = useState<string>(''); // Use string for input

  // State for editing existing log entries
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editedEntryData, setEditedEntryData] = useState<EditedEntryData>({});
  const [editedTimestampString, setEditedTimestampString] = useState<string>(''); // For datetime-local input

  // State for cropping modal
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<CropType>(); // Crop area state (using % initially)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>(); // Completed crop state (in pixels)

  // State to track client-side mounting for hydration fix
  const [isClient, setIsClient] = useState(false);

  // Ref to track if a log operation was just attempted
  const logAttemptedRef = useRef(false);

  // Set isClient to true only after component mounts on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Display storage errors using toast
   useEffect(() => {
     if (storageError instanceof LocalStorageError) {
        toast({
            title: "記錄儲存錯誤",
            description: storageError.message, // Use the user-friendly message from the hook
            variant: "destructive",
            duration: 9000, // Show longer
        });
        // Reset the log attempt flag if there was a storage error during logging
        logAttemptedRef.current = false;
     }
     if (profileStorageError instanceof LocalStorageError) {
        toast({
            title: "個人資料儲存錯誤",
            description: profileStorageError.message, // Use the user-friendly message from the hook
            variant: "destructive",
            duration: 7000,
        });
     }
   }, [storageError, profileStorageError, toast]); // Depend on the error objects


  // Cleanup camera stream on unmount or when camera is closed
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Calculate Daily Summaries when log changes
  useEffect(() => {
    if (!isClient || !Array.isArray(calorieLog)) { // Ensure calorieLog is an array
        setDailySummaries([]); // Clear summaries if log is empty, not an array, or not on client
        return;
    }

    const summaries: { [date: string]: DailySummary } = {};

    calorieLog.forEach(entry => {
       if (!entry || typeof entry !== 'object' || !entry.timestamp || typeof entry.timestamp !== 'number') {
            console.warn("Skipping invalid log entry:", entry);
            return; // Skip invalid entries
        }

       try {
           const entryDateObj = new Date(entry.timestamp);
           if (!isValid(entryDateObj)) { // Check if date is valid using date-fns
                console.warn("Skipping log entry with invalid timestamp:", entry);
                return; // Skip entries with invalid timestamps
            }

            const entryDate = format(startOfDay(entryDateObj), 'yyyy-MM-dd');

            if (!summaries[entryDate]) {
                summaries[entryDate] = {
                    date: entryDate,
                    totalCalories: 0,
                    totalAmount: 0,
                    entries: []
                };
            }

            // Safely add calories and amount, defaulting to 0 if invalid
            const calories = typeof entry.calorieEstimate === 'number' && !isNaN(entry.calorieEstimate) ? entry.calorieEstimate : 0;
            const amountValue = typeof entry.amount === 'number' && !isNaN(entry.amount) ? entry.amount : 0;


            summaries[entryDate].totalCalories += calories;
            summaries[entryDate].totalAmount += amountValue;
            summaries[entryDate].entries.push(entry);

       } catch (dateError) {
           console.error("Error processing date for log entry:", entry, dateError);
           // Skip this entry if date processing fails
       }
    });

    // Sort entries within each summary by timestamp (descending) - Safely
    Object.values(summaries).forEach(summary => {
        summary.entries.sort((a, b) => {
            const timeA = typeof a.timestamp === 'number' ? a.timestamp : 0;
            const timeB = typeof b.timestamp === 'number' ? b.timestamp : 0;
            return timeB - timeA; // Descending order
        });
    });

    // Convert to array and sort summaries by date (descending) - Safely
    const sortedSummaries = Object.values(summaries).sort((a, b) => {
        // Basic string comparison works for 'yyyy-MM-dd' format
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return 0;
    });


    setDailySummaries(sortedSummaries);
  }, [calorieLog, isClient]); // Re-run when log or client status changes


  // Function to fetch current location
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
    setLocation('正在取得地點...'); // Placeholder

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Basic approach: just show coordinates. A real app might use reverse geocoding API.
        // const locString = `緯度: ${position.coords.latitude.toFixed(4)}, 經度: ${position.coords.longitude.toFixed(4)}`;
        const locString = "目前位置"; // Simplified for demo
        setLocation(locString);
        setIsFetchingLocation(false);
        toast({
            title: "地點已取得",
            description: "已設定目前位置。",
        });
      },
      (geoError) => {
        // Log specific error details - Improved
        console.error(`取得地點時發生錯誤 (代碼: ${geoError.code || '未知'}): ${geoError.message || '沒有訊息'}`, geoError);


        let description = "無法取得您的地點。";
        if (geoError.code === geoError.PERMISSION_DENIED) {
            description = "地點權限遭拒。請在瀏覽器設定中啟用。";
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
            description = "無法取得地點資訊。";
        } else if (geoError.code === geoError.TIMEOUT) {
            description = "取得使用者地點的要求已逾時。";
        }
        setLocation(''); // Clear placeholder on error
        setIsFetchingLocation(false);
        toast({
          title: "地點錯誤",
          description: description,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options
    );
  }, [toast]);

 const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      setImageSrc(null); // Clear final preview
      setOriginalImageSrc(null); // Clear original image
      clearEstimation();
      setCrop(undefined); // Reset crop state
      setCompletedCrop(undefined);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setOriginalImageSrc(result); // Set the original image for the cropper
        setIsCropping(true); // Open the cropping modal
        // Reset file input value here allows selecting the same file again
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
           // Reset file input on read error
           if (fileInputRef.current) {
               fileInputRef.current.value = "";
           }
      }
      reader.readAsDataURL(file);
    } else {
       // Reset file input if no file was selected (e.g., user cancelled)
       if (fileInputRef.current) {
           fileInputRef.current.value = "";
       }
    }
  };

   // Called when image loads in the cropper
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
     if (width > 0 && height > 0) {
      // Set the initial crop to 100% width and height
      setCrop({
          unit: '%',
          width: 100,
          height: 100,
          x: 0,
          y: 0
      });
      // Also trigger onComplete immediately with pixel values for 100% crop
      setCompletedCrop({
          unit: 'px',
          width: width,
          height: height,
          x: 0,
          y: 0
      });

     } else {
         console.warn("Image dimensions are zero on load, cannot set initial crop.");
         // Optionally, set a default crop or wait for valid dimensions
         // Setting a percentage crop might still be useful as a fallback
         setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
     }
  }

   // Handle the crop confirmation
  const handleCropConfirm = async () => {
    // Check if completedCrop and image ref exist
    if (completedCrop?.width && completedCrop?.height && imgRef.current && originalImageSrc) {
      // Add check: Ensure crop dimensions are not zero
      if (completedCrop.width === 0 || completedCrop.height === 0) {
          toast({
              title: "裁切錯誤",
              description: "裁切區域的寬度或高度不能為零。",
              variant: "destructive",
          });
          return; // Prevent proceeding with zero dimensions
      }

      setIsLoading(true);
      setLoadingMessage('正在裁切並壓縮影像...');
      setIsCropping(false); // Close modal immediately

      try {
        // Get the cropped image data URL (already compressed by getCroppedImg)
        const croppedDataUrl = await getCroppedImg(
          imgRef.current,
          completedCrop // Pass the pixel crop state
        );

        setImageSrc(croppedDataUrl); // Set the final preview image AND the image to be stored
        setOriginalImageSrc(null); // Clear original image source to free memory
        setLoadingMessage('正在估計卡路里...');
        await estimateCalories(croppedDataUrl); // Start estimation

      } catch (cropError) {
        console.error("影像裁切失敗:", cropError);
        setError(`影像裁切失敗: ${cropError instanceof Error ? cropError.message : 'Unknown error'}`);
        toast({
          title: "處理錯誤",
          description: "無法裁切影像。請再試一次。",
          variant: "destructive",
        });
        setIsLoading(false); // Stop loading on error
        setOriginalImageSrc(null); // Clear original image source on error
      }
    } else {
        toast({
            title: "裁切錯誤",
            description: "請選取要裁切的區域，或等待影像載入完成。", // Updated message
            variant: "destructive",
        });
    }
  };

  // Handle closing the crop modal without confirming
  const handleCropCancel = () => {
    setIsCropping(false);
    setOriginalImageSrc(null); // Clear original image
    setCrop(undefined);
    setCompletedCrop(undefined);
    // Optionally clear file input again if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };


  const openCamera = async () => {
    setError(null);
    setImageSrc(null);
    setOriginalImageSrc(null); // Clear original image if any
    clearEstimation();
    try {
      // Prefer environment camera, fallback to default
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' } }
      };
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn("Environment camera failed, trying default:", err);
        // Fallback to default camera if environment fails
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Ensure video plays inline on iOS
        videoRef.current.setAttribute('playsinline', 'true');
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
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setIsCameraOpen(false);
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }
  };

 const takePicture = () => {
    if (videoRef.current && canvasRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) { // Check readyState
      setIsLoading(true); // Start loading early
      setLoadingMessage('正在處理並壓縮影像...');
      setError(null);
      setImageSrc(null); // Clear final preview
      setOriginalImageSrc(null); // Clear original
      clearEstimation();

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Match canvas dimensions to video's actual dimensions
       const videoWidth = video.videoWidth;
       const videoHeight = video.videoHeight;

       if (videoWidth === 0 || videoHeight === 0) {
          console.error("Video dimensions are zero, cannot take picture yet.");
           toast({ title: "拍攝錯誤", description: "相機畫面尚未就緒。", variant: "destructive" });
           setIsLoading(false); // Stop loading
           return; // Exit if dimensions aren't ready
       }


      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
         // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the image data from the canvas (compressed)
        let dataUri: string;
        try {
           // Use jpeg with quality setting for compression
           dataUri = canvas.toDataURL('image/jpeg', IMAGE_QUALITY); // Use defined quality
            // Optional: Fallback to png if jpeg fails? unlikely but possible
             if (!dataUri || dataUri === 'data:,') {
                console.warn("toDataURL('image/jpeg') failed, falling back to png.");
                dataUri = canvas.toDataURL('image/png');
            }
        } catch (e) {
             console.error("Error creating data URL from canvas:", e);
             toast({ title: "拍攝錯誤", description: "無法處理拍攝的影像。", variant: "destructive" });
             closeCamera(); // Close camera even on error
             setIsLoading(false);
             return; // Exit if data URL creation fails
        }


         if (!dataUri || dataUri === 'data:,') {
             console.error("Failed to get data URI from canvas.");
             toast({ title: "拍攝錯誤", description: "無法從相機擷取有效的影像。", variant: "destructive" });
             closeCamera(); // Close camera even on error
             setIsLoading(false);
             return; // Exit if data URL is invalid
         }


        // Successfully captured and compressed image
        setImageSrc(dataUri); // Set final preview AND the image to be stored
        closeCamera(); // Close camera after taking picture
        setLoadingMessage('正在估計卡路里...'); // Update message
        estimateCalories(dataUri); // Start estimation with compressed image
      } else {
          setError("無法取得畫布內容。");
          toast({ title: "拍攝錯誤", description: "無法從相機拍攝影像。", variant: "destructive" });
          closeCamera(); // Close camera even on error
          setIsLoading(false);
      }
    } else {
        let errorMsg = "相機或畫布尚未就緒。";
        if (videoRef.current && videoRef.current.readyState < videoRef.current.HAVE_CURRENT_DATA) {
           errorMsg = "相機畫面仍在載入中。";
        }
        setError(errorMsg);
        toast({ title: "拍攝錯誤", description: errorMsg, variant: "destructive" });
        closeCamera(); // Close camera even on error
        setIsLoading(false);
    }
  };


  const clearEstimation = () => {
     setEstimationResult(null);
     setError(null);
     setEditedFoodItem('');
     setEditedCalorieEstimate(''); // Clear editable calories as well
     setLocation('');
     setMealType(undefined);
     setAmount('');
     setLoadingMessage(''); // Clear loading message as well
  }

  const clearAll = () => {
      setImageSrc(null); // Clear the stored image source as well
      setOriginalImageSrc(null);
      clearEstimation();
      setIsCameraOpen(false);
      closeCamera(); // Ensure stream is stopped if open
       if (fileInputRef.current) {
           fileInputRef.current.value = "";
       }
  }

  const estimateCalories = useCallback(async (photoDataUri: string) => {
    // setIsLoading(true) is likely already true from handleImageChange or takePicture
    setLoadingMessage('正在估計卡路里...'); // Ensure message is correct
    setError(null);
    // Keep existing imageSrc (compressed preview / image to be stored)
    // setEstimationResult(null); // Already cleared in callers

    try {
      // Optional: log compressed size for debugging
      const sizeInKB = (photoDataUri.length * (3/4)) / 1024;
      console.log(`正在估計卡路里，壓縮後影像大小: ${sizeInKB.toFixed(1)} KB`);

      // No need for explicit size check here anymore, compression handled it.
      // The Genkit call might still fail if the *compressed* image is too large for the API,
      // but this is less likely.

      const result = await estimateCalorieCount({ photoDataUri });

      if (result.confidence < 0.5) {
         toast({
          title: "低信賴度估計",
          description: "影像可能不清晰，或難以辨識食物品項。卡路里估計值可能較不準確。",
          variant: "default",
          duration: 5000, // Show longer
        });
      }

      setEstimationResult(result);
      setEditedFoodItem(result.foodItem); // Pre-fill editable name
      setEditedCalorieEstimate(result.calorieEstimate.toString()); // Pre-fill editable calories as string
      fetchCurrentLocation(); // Attempt to fetch location after getting result

    } catch (err) {
      console.error("估計卡路里時發生錯誤:", err);
      let errorMsg = "無法估計卡路里。請再試一次。";
      if (err instanceof Error) {
         // Check for specific known error types if possible
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
      setIsLoading(false); // Stop loading indicator
      setLoadingMessage(''); // Clear loading message
    }
  }, [toast, fetchCurrentLocation]); // Added fetchCurrentLocation dependency

  const logCalories = () => {
    // Set the flag indicating a log attempt
    logAttemptedRef.current = true;

    // Validation for edited values before logging
    if (!editedFoodItem || !editedFoodItem.trim()) {
         toast({ title: "記錄錯誤", description: "食物品項名稱不可為空。", variant: "destructive" });
         logAttemptedRef.current = false; // Reset flag on validation error
         return;
    }
    const parsedCalories = parseInt(editedCalorieEstimate, 10); // Parse the editable calorie string
    if (isNaN(parsedCalories) || parsedCalories < 0) {
        toast({ title: "記錄錯誤", description: "請輸入有效的卡路里數值（非負整數）。", variant: "destructive" });
        logAttemptedRef.current = false; // Reset flag on validation error
        return;
    }
     // Validate amount
    const parsedAmount = amount === '' ? undefined : parseFloat(amount); // Allow empty string for amount
    if (amount !== '' && (parsedAmount === undefined || isNaN(parsedAmount) || parsedAmount < 0)) {
        toast({ title: "記錄錯誤", description: "請輸入有效的金額（非負數）。", variant: "destructive" });
        logAttemptedRef.current = false; // Reset flag on validation error
        return;
    }


    // Check for imageSrc being present as it's now required for the log entry
    if (estimationResult && imageSrc) { // Use estimationResult for confidence, but edited values for others
      // Create entry based on the storage interface (now includes imageUrl)
      const newLogEntry: LogEntryStorage = {
        // Use confidence from original estimation, but other values from edited state
        confidence: estimationResult.confidence,
        calorieEstimate: parsedCalories, // Use the parsed edited calorie value
        foodItem: editedFoodItem.trim(), // Use the trimmed edited name
        id: Date.now().toString(),
        timestamp: Date.now(), // Default timestamp is now
        imageUrl: imageSrc, // STORE the compressed image data URI
        location: location || undefined, // Use location from state
        mealType: mealType, // Use meal type from state
        amount: parsedAmount, // Use parsed amount (can be undefined)
      };

      try {
        // Limit the log size (e.g., keep only the latest N entries)
        const MAX_LOG_ENTRIES = 100; // Increase limit slightly if needed, but keep it reasonable
        setCalorieLog(prevLog => {
           // Ensure prevLog is an array before spreading
           const currentLog = Array.isArray(prevLog) ? prevLog : [];
           return [newLogEntry, ...currentLog].slice(0, MAX_LOG_ENTRIES);
        });
        // Toast for success moved to useEffect to ensure state update and check for storage error

      } catch (saveError) {
        // This catch block might not be strictly necessary anymore if the hook handles errors,
        // but kept as a safeguard.
        console.error("Error explicitly caught while calling setCalorieLog:", saveError);
        logAttemptedRef.current = false; // Reset flag on save error
        if (saveError instanceof LocalStorageError) {
             toast({
                title: "記錄儲存失敗",
                description: saveError.message, // Display the user-friendly message
                variant: "destructive",
                duration: 9000, // Show longer
             });
        } else {
             toast({
                title: "記錄儲存失敗",
                description: "儲存卡路里記錄時發生未預期的錯誤。",
                variant: "destructive",
             });
        }
        // Important: Don't clear the form here, let the user retry or cancel
        // clearAll(); // Avoid clearing on error
      }


    } else {
         let errorDesc = "沒有可記錄的估計結果或影像。";
         if (!imageSrc) {
             errorDesc = "缺少影像資料無法記錄。"; // Add check for missing image
         }
         toast({
            title: "記錄錯誤",
            description: errorDesc,
            variant: "destructive",
         });
         logAttemptedRef.current = false; // Reset flag if no data to log
    }
  };

  // UseEffect to show success toast only after successful state update and no storage error
   useEffect(() => {
     // Only run this effect if the component is mounted on the client and a log was attempted
     if (!isClient || !logAttemptedRef.current) return;

     // Check if there's no storage error currently.
     if (!storageError) {
       // Find the potentially just added entry (assuming it's the first one after update)
       const lastEntry = calorieLog[0];

       // Check if the last entry matches the data we *intended* to log.
       // This is an approximation to detect if the log operation was the last state update.
       if (lastEntry && lastEntry.imageUrl === imageSrc && lastEntry.foodItem === editedFoodItem.trim()) {

         // Show the success toast
         toast({
           title: "記錄成功",
           description: `${lastEntry.foodItem} (${lastEntry.calorieEstimate} 大卡) 已新增至您的記錄中。`,
         });

         // Clear the form/input state *after* successfully logging and showing the toast.
         clearAll();
       }
     }
     // Reset the log attempt flag regardless of success or failure (error handled by other effect)
     logAttemptedRef.current = false;

     // Dependencies: calorieLog (to react to updates), storageError (to know if update failed),
     // isClient (to ensure client-side execution), toast (for showing messages).
     // Include imageSrc and editedFoodItem to ensure the comparison inside uses the correct intended values.
   }, [calorieLog, storageError, isClient, toast, imageSrc, editedFoodItem]);


  const deleteLogEntry = (id: string) => {
    try {
        // Ensure setCalorieLog works with potentially non-array initial state
        setCalorieLog(prevLog => {
           const currentLog = Array.isArray(prevLog) ? prevLog : [];
           return currentLog.filter(entry => entry.id !== id);
        });

        // Check storageError after update (similar caveat as in logCalories)
        // The useEffect watching storageError will handle the error toast if needed.
         if (!storageError) { // Show success only if no immediate error from the setter
            toast({
                title: "記錄項目已刪除",
                description: "所選項目已從您的記錄中移除。",
            });
         }
    } catch (deleteError) {
        // Catch potential errors thrown by the setter (though unlikely with current hook setup)
         console.error("Error explicitly caught while deleting log entry:", deleteError);
         if (deleteError instanceof LocalStorageError) {
              toast({ title: "刪除錯誤", description: deleteError.message, variant: "destructive", duration: 7000 });
         } else {
            toast({ title: "刪除錯誤", description: "刪除記錄項目時發生未預期的錯誤。", variant: "destructive" });
        }
    }
};

  // --- Edit Entry Functions ---
  const startEditing = (entry: LogEntryStorage) => {
    setEditingEntryId(entry.id);
    setEditedEntryData({
      foodItem: entry.foodItem,
      calorieEstimate: entry.calorieEstimate,
      timestamp: entry.timestamp, // Keep original timestamp for initial value
      location: entry.location,
      mealType: entry.mealType,
      amount: entry.amount,
    });
    // Set the string representation for the datetime-local input
    setEditedTimestampString(formatDateTimeLocal(entry.timestamp));
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
    setEditedEntryData({});
    setEditedTimestampString('');
  };

  const handleEditInputChange = (field: keyof EditedEntryData, value: string | number | MealType | undefined) => {
    // Special handling for calorieEstimate to keep it as number in the state
    if (field === 'calorieEstimate') {
        const numValue = value === '' ? undefined : parseInt(value as string, 10);
         // Store undefined if parsing fails or NaN, otherwise store the number
        setEditedEntryData(prev => ({ ...prev, [field]: (numValue !== undefined && !isNaN(numValue) && numValue >= 0) ? numValue : undefined }));
    } else if (field === 'amount') {
         const numValue = value === '' ? undefined : parseFloat(value as string);
         // Allow empty or non-negative numbers
         setEditedEntryData(prev => ({ ...prev, [field]: (value === '' || (numValue !== undefined && !isNaN(numValue) && numValue >= 0)) ? numValue : prev.amount }));
    }
    else {
      setEditedEntryData(prev => ({ ...prev, [field]: value }));
    }
  };


  const handleEditTimestampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTimestampString = e.target.value;
    setEditedTimestampString(newTimestampString); // Update the string state
    // Attempt to parse and update the numeric timestamp in editedEntryData
    const newTimestamp = parseDateTimeLocal(newTimestampString);
    if (newTimestamp !== null) {
      setEditedEntryData(prev => ({ ...prev, timestamp: newTimestamp }));
    } else {
      // Optionally handle invalid date input, e.g., clear timestamp or show error
      // For now, just update the string, validation happens on save
      setEditedEntryData(prev => ({ ...prev, timestamp: undefined })); // Indicate invalid time temporarily
    }
  };

  const saveEditedEntry = (id: string) => {
    const editedTimestamp = parseDateTimeLocal(editedTimestampString); // Parse final string value

    // Validation
    if (!editedEntryData.foodItem || !editedEntryData.foodItem.trim()) {
        toast({ title: "儲存錯誤", description: "食物品項名稱不可為空。", variant: "destructive" });
        return;
    }
    const editedCalories = editedEntryData.calorieEstimate;
    if (editedCalories === undefined || isNaN(editedCalories) || editedCalories < 0) {
        toast({ title: "儲存錯誤", description: "請輸入有效的卡路里數值（非負數）。", variant: "destructive" });
        return;
    }
    if (editedTimestamp === null) {
        toast({ title: "儲存錯誤", description: "請輸入有效的日期和時間。", variant: "destructive" });
        return;
    }
     const editedAmount = editedEntryData.amount;
     if (editedAmount !== undefined && (isNaN(editedAmount) || editedAmount < 0)) {
         toast({ title: "儲存錯誤", description: "請輸入有效的金額（非負數）。", variant: "destructive" });
         return;
     }

    try {
         // Ensure setCalorieLog works with potentially non-array initial state
        setCalorieLog(prevLog => {
            const currentLog = Array.isArray(prevLog) ? prevLog : [];
            return currentLog.map(entry =>
                entry.id === id
                    ? {
                        ...entry, // Keep original confidence, id, imageUrl
                        foodItem: editedEntryData.foodItem!.trim(),
                        calorieEstimate: editedCalories, // Already validated number
                        timestamp: editedTimestamp, // Use parsed timestamp
                        location: editedEntryData.location || undefined, // Handle empty string for location
                        mealType: editedEntryData.mealType,
                        amount: editedAmount, // Already validated number or undefined
                      }
                    : entry
            );
        });

         // Check storageError after update (similar caveat as in logCalories)
         // The useEffect watching storageError will handle the error toast if needed.
         if (!storageError) { // Show success only if no immediate error from the setter
            cancelEditing(); // Exit edit mode
            toast({
                title: "記錄已更新",
                description: "項目已成功更新。",
            });
         }
    } catch (saveError) {
        // Catch potential errors thrown by the setter (though unlikely with current hook setup)
         console.error("Error explicitly caught while saving edited entry:", saveError);
         if (saveError instanceof LocalStorageError) {
              toast({ title: "更新錯誤", description: saveError.message, variant: "destructive", duration: 7000 });
         } else {
             toast({ title: "更新錯誤", description: "更新記錄項目時發生未預期的錯誤。", variant: "destructive" });
         }
    }

  };
  // --- End Edit Entry Functions ---

  // Handlers for User Profile Input - Using useCallback with dependency on setUserProfile
 const handleProfileChange = useCallback((field: keyof UserProfile, value: string | ActivityLevel | undefined) => {
     if (!isClient) return; // Do nothing server-side

    setUserProfile(prev => {
        // Ensure prev is an object, default to empty if not
        const currentProfile = typeof prev === 'object' && prev !== null ? prev : {};
        const newProfile = { ...currentProfile };
        let processedValue: number | ActivityLevel | undefined;

        if (field === 'height' || field === 'weight') {
            const numValue = value === '' ? undefined : parseFloat(value as string);
            processedValue = numValue !== undefined && !isNaN(numValue) && numValue >= 0 ? numValue : undefined;
        } else if (field === 'activityLevel') {
            const validLevels = Object.keys(activityLevelTranslations);
            processedValue = validLevels.includes(value as string) ? (value as ActivityLevel) : undefined;
        } else {
             return prev; // Return original state if field is unknown
        }

        // Check if the value actually changed before updating
        if (newProfile[field] !== processedValue) {
           newProfile[field] = processedValue;
           return newProfile;
        }
        return prev; // No change, return previous state
    });
 }, [setUserProfile, isClient]); // Added isClient dependency


  const estimatedDailyNeeds = useMemo(() => calculateEstimatedNeeds(userProfile), [userProfile]);


  const triggerFileInput = () => {
     // Clear previous image src if user clicks upload again
     setImageSrc(null); // Clear the image to be stored/previewed
     setOriginalImageSrc(null); // Clear original too
     clearEstimation(); // Clear results
    fileInputRef.current?.click();
  };

  // Helper to render meal icon
  const renderMealIcon = (mealType?: MealType) => {
    switch (mealType) {
      case 'Breakfast': return <Coffee className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="早餐"/>;
      case 'Lunch': return <Sun className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="午餐"/>;
      case 'Dinner': return <Moon className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="晚餐"/>;
      case 'Snack': return <Apple className="h-4 w-4 inline-block mr-1 text-muted-foreground" aria-label="點心"/>;
      default: return null;
    }
  };

  const renderEstimationResult = () => {
    // Note: Main loading state is handled outside this function now,
    // but we keep this initial check for the case where estimateCalories is called directly (less common now)
    if (isLoading && !estimationResult && !error) {
      return (
        <div className="flex flex-col items-center justify-center p-6 space-y-2">
          <LoadingSpinner size={32} />
          <p className="text-muted-foreground">{loadingMessage || '正在處理...'}</p>
        </div>
      );
    }

    if (error && !estimationResult) { // Show error only if there's no result to display alongside
      return (
         <Card className="border-destructive bg-destructive/10">
             <CardHeader>
                 <CardTitle className="text-destructive flex items-center gap-2"><X size={20}/> 估計錯誤</CardTitle> {/* Add icon */}
             </CardHeader>
             <CardContent>
                <p className="text-destructive-foreground">{error}</p> {/* Ensure text is readable */}
             </CardContent>
             <CardFooter>
                  {/* Make dismiss button more prominent */}
                 <Button variant="ghost" className="text-destructive-foreground underline" onClick={clearAll}>關閉</Button>
             </CardFooter>
         </Card>
      );
    }

    if (estimationResult) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>記錄詳細資訊</CardTitle>
             <CardDescription>記錄前請檢視並編輯詳細資訊。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview Image (cropped and compressed) */}
            {imageSrc && (
                 // Use aspect-video for consistent ratio, contain ensures full image visible
                <div className="relative aspect-video w-full overflow-hidden rounded-md border mb-4 bg-muted/30">
                  <Image
                    src={imageSrc}
                    alt="食物品項預覽"
                    fill // Use fill instead of layout="fill" in newer Next.js
                    sizes="(max-width: 768px) 100vw, 50vw" // Add sizes for responsive optimization
                    style={{ objectFit: 'contain' }} // Use style object for objectFit
                    data-ai-hint="食物 盤子"
                    className="rounded-md" // Ensure image itself doesn't overflow container border
                    priority={true} // Prioritize loading the preview image
                  />
                </div>
            )}


            {/* Editable Food Item */}
            <div className="space-y-1">
                <Label htmlFor="foodItem">食物品項 <span className="text-destructive">*</span></Label> {/* Indicate required */}
                <Input
                    id="foodItem"
                    value={editedFoodItem}
                    onChange={(e) => setEditedFoodItem(e.target.value)}
                    placeholder="例如：雞肉沙拉"
                    aria-required="true" // ARIA for required
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
                         // Allow only non-negative integers
                         const val = e.target.value;
                         if (val === '' || /^\d+$/.test(val)) {
                             setEditedCalorieEstimate(val);
                         }
                     }}
                     placeholder="例如：350"
                     min="0"
                     step="1" // Allow only integers
                     aria-required="true"
                     inputMode="numeric" // Hint for mobile keyboards
                 />
             </div>

            {/* Read-only Confidence */}
             <div className="flex justify-end text-sm pt-1"> {/* Adjusted alignment */}
                 {/* Conditional rendering for confidence */}
                <p className={estimationResult.confidence < 0.7 ? 'text-orange-600' : 'text-muted-foreground'}> {/* Use muted-foreground for normal */}
                    <strong className="font-medium">AI 估計信賴度：</strong>
                    {Math.round(estimationResult.confidence * 100)}%
                     {estimationResult.confidence < 0.5 && <span className="ml-1 text-xs">(低)</span>}
                </p>

            </div>

             <Separator className="my-3"/> {/* Separator for clarity */}

            {/* Location */}
            <div className="space-y-1">
                <Label htmlFor="location">地點</Label>
                 <div className="flex gap-2 items-center">
                    <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="例如：家裡、辦公室"
                        disabled={isFetchingLocation}
                         aria-label="輸入地點"
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchCurrentLocation}
                        disabled={isFetchingLocation}
                        aria-label={isFetchingLocation ? "正在取得目前位置" : "取得目前位置"} // Dynamic label
                        title={isFetchingLocation ? "正在取得..." : "取得目前位置"}
                        >
                        {isFetchingLocation ? <LoadingSpinner size={16}/> : <LocateFixed className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Meal Type */}
             <div className="space-y-1 pt-2"> {/* Add padding top */}
                <Label>餐點類型 (選填)</Label>
                 {/* Use grid for better layout on smaller screens */}
                 <RadioGroup value={mealType} onValueChange={(value) => setMealType(value as MealType)} className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 sm:grid-cols-4">
                    {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as MealType[]).map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                        <RadioGroupItem value={type} id={`meal-${type}`} />
                        <Label htmlFor={`meal-${type}`} className="font-normal cursor-pointer flex items-center gap-1.5"> {/* Gap for icon */}
                            {renderMealIcon(type)} {mealTypeTranslations[type]} {/* Use translated text */}
                        </Label>
                    </div>
                    ))}
                </RadioGroup>
            </div>

            {/* Amount/Cost */}
            <div className="space-y-1 pt-2"> {/* Add padding top */}
                <Label htmlFor="amount">金額 / 費用 (選填)</Label>
                <div className="relative">
                     <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /> {/* Centered icon */}
                    <Input
                        id="amount"
                        type="number"
                        value={amount}
                         // Prevent negative numbers, allow decimals
                        onChange={(e) => {
                            const val = e.target.value;
                            // Allow empty string, allow numbers (int/float), prevent negative sign start
                             if (val === '' || (/^\d*\.?\d*$/.test(val) && parseFloat(val) >= 0) || val === '.') {
                                setAmount(val);
                             }
                        }}
                        onBlur={(e) => {
                             // Format to 2 decimal places on blur if it's a valid number
                            const num = parseFloat(e.target.value);
                            if (!isNaN(num) && num >= 0) {
                                setAmount(num.toFixed(2));
                            } else if (e.target.value !== '' && e.target.value !== '.') {
                                // Clear invalid input on blur (optional)
                                // setAmount('');
                            } else if (e.target.value === '') {
                                // Ensure empty string remains empty (no "0.00")
                                setAmount('');
                            }
                        }}

                        placeholder="0.00"
                        className="pl-8" // Add padding for the icon
                        step="0.01" // Hint for browser controls
                        min="0" // HTML5 validation
                        inputMode="decimal" // Hint for mobile keyboards
                         aria-label="輸入金額或費用"
                    />
                </div>
            </div>

          </CardContent>
          <CardFooter className="flex-col sm:flex-row gap-2 pt-4"> {/* Add padding top */}
             {/* Make Log button more prominent */}
            <Button
                onClick={logCalories}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto flex-1 sm:flex-none"
                 disabled={
                    !editedFoodItem || !editedFoodItem.trim() ||
                    editedCalorieEstimate === '' || isNaN(parseInt(editedCalorieEstimate)) || parseInt(editedCalorieEstimate) < 0 ||
                    (amount !== '' && (isNaN(parseFloat(amount)) || parseFloat(amount) < 0)) || // Validate amount here too
                    isLoading || !imageSrc
                 } // Disable if invalid data, loading, or no image
             >
              {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <PlusCircle className="mr-2 h-4 w-4" />}
               記錄卡路里
            </Button>
             <Button variant="outline" onClick={clearAll} className="w-full sm:w-auto">
                取消
            </Button>
          </CardFooter>
        </Card>
      );
    }
    return null; // No result or error yet
  };


  const renderLogEntry = (entry: LogEntryStorage) => {
    const isEditing = editingEntryId === entry.id;
    const entryTimestamp = entry.timestamp && typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(); // Fallback if timestamp is bad

    return (
        <div className="flex items-start space-x-3 sm:space-x-4 py-3">
            {/* Image */}
             <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-md bg-muted border text-muted-foreground flex-shrink-0 overflow-hidden">
                {entry.imageUrl ? (
                    <Image
                        src={entry.imageUrl}
                        alt={`記錄項目：${entry.foodItem || '未知食物'}`}
                        fill sizes="(max-width: 640px) 4rem, 5rem"
                        style={{ objectFit: 'cover' }} className="rounded-md" data-ai-hint="食物 盤子" loading="lazy"
                        onError={(e) => {
                            console.warn(`Error loading image for entry ${entry.id}`, e);
                             // Optionally set a flag or use a placeholder src
                             // e.currentTarget.src = '/placeholder-image.png';
                             e.currentTarget.style.display = 'none'; // Hide broken image icon
                             // Find the parent div and show a fallback icon
                             const parentDiv = e.currentTarget.parentElement;
                             if (parentDiv) {
                                 const fallbackIcon = parentDiv.querySelector('.fallback-icon');
                                 if (fallbackIcon) fallbackIcon.classList.remove('hidden');
                             }
                         }}
                    />
                ) : null }
                {/* Fallback Icon - Hidden by default, shown on error */}
                 <ImageOff size={32} aria-label="無可用影像" className={`fallback-icon ${entry.imageUrl ? 'hidden' : ''}`} />
            </div>

            {/* Content / Edit Form */}
            <div className="flex-1 space-y-2 overflow-hidden">
                {isEditing ? (
                    <>
                        {/* Food Item */}
                        <div className="space-y-1">
                            <Label htmlFor={`edit-food-${entry.id}`}>食物品項 <span className="text-destructive">*</span></Label>
                            <Input id={`edit-food-${entry.id}`} value={editedEntryData.foodItem ?? ''}
                                   onChange={(e) => handleEditInputChange('foodItem', e.target.value)} placeholder="例如：雞肉沙拉" />
                        </div>
                        {/* Calories */}
                         <div className="space-y-1">
                            <Label htmlFor={`edit-calories-${entry.id}`}>卡路里 (大卡) <span className="text-destructive">*</span></Label>
                            <Input id={`edit-calories-${entry.id}`} type="number" min="0" step="1" inputMode="numeric"
                                   value={editedEntryData.calorieEstimate ?? ''} // Display number from state
                                   onChange={(e) => handleEditInputChange('calorieEstimate', e.target.value)} placeholder="例如：350" />
                        </div>
                         {/* Timestamp */}
                         <div className="space-y-1">
                             <Label htmlFor={`edit-timestamp-${entry.id}`}>日期與時間 <span className="text-destructive">*</span></Label>
                             <Input
                                 id={`edit-timestamp-${entry.id}`}
                                 type="datetime-local"
                                 value={editedTimestampString} // Use string state
                                 onChange={handleEditTimestampChange}
                                 max={formatDateTimeLocal(Date.now())} // Prevent future dates/times
                                 step="60" // Allow minute precision
                             />
                         </div>

                        {/* Location */}
                        <div className="space-y-1">
                             <Label htmlFor={`edit-location-${entry.id}`}>地點</Label>
                             <Input id={`edit-location-${entry.id}`} value={editedEntryData.location ?? ''}
                                    onChange={(e) => handleEditInputChange('location', e.target.value)} placeholder="例如：家裡" />
                        </div>

                        {/* Meal Type */}
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

                        {/* Amount */}
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
                    <>
                        <p className="font-semibold text-base truncate">{entry.foodItem || '未知食物'}</p>
                        <p className="text-sm text-primary">
                           {typeof entry.calorieEstimate === 'number' && !isNaN(entry.calorieEstimate) ? entry.calorieEstimate : '??'} 大卡
                        </p>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            <div className="flex items-center flex-wrap gap-x-2">
                                {entry.mealType && mealTypeTranslations[entry.mealType] && ( // Check if mealType is valid
                                    <div className="flex items-center">
                                        {renderMealIcon(entry.mealType)}
                                        <span>{mealTypeTranslations[entry.mealType]}</span>
                                    </div>
                                )}
                                <span>
                                    {/* Safely format date */}
                                    {isValid(new Date(entryTimestamp)) ? format(new Date(entryTimestamp), 'yyyy/MM/dd HH:mm') : '無效時間'}
                                </span>
                            </div>
                            {entry.location && (
                                <div className="flex items-center">
                                    <MapPin className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" />
                                    <span className="truncate">{entry.location}</span>
                                </div>
                            )}
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

            {/* Action Buttons */}
            <div className="flex flex-col space-y-1 sm:space-y-2 shrink-0 self-start">
                {isEditing ? (
                    <>
                        <Button variant="ghost" size="icon" onClick={() => saveEditedEntry(entry.id)} className="text-primary hover:bg-primary/10 h-8 w-8" aria-label="儲存變更" title="儲存變更">
                            <Save className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={cancelEditing} className="text-muted-foreground hover:bg-muted/10 h-8 w-8" aria-label="取消編輯" title="取消編輯">
                            <Ban className="h-4 w-4" />
                        </Button>
                    </>
                ) : (
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
       {/* Left Column: Image Capture, Estimation, Profile */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>拍攝或上傳食物照片</CardTitle>
            <CardDescription>使用相機或上傳圖片來估計卡路里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {isCameraOpen && (
                <div className="relative">
                     {/* Ensure video element fits well and shows background while loading */}
                    <video ref={videoRef} playsInline muted className="w-full rounded-md border aspect-video object-cover bg-muted"></video>
                     {/* Take Picture Button */}
                    <Button
                        onClick={takePicture}
                        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 h-auto shadow-lg z-10 border-2 border-background" // Added border
                        aria-label="拍攝照片"
                        disabled={isLoading} // Disable while loading/estimating
                        >
                        <Camera size={24} />
                    </Button>
                     {/* Close Camera Button */}
                     <Button onClick={closeCamera} variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full z-10" aria-label="關閉相機">
                        <X size={18} />
                    </Button>
                </div>
            )}
             {/* Hidden canvas for capturing frame */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

             {/* Cropping Modal */}
             <Dialog open={isCropping} onOpenChange={(open) => { if (!open) handleCropCancel(); }}>
                  <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto"> {/* Adjust size and allow scroll */}
                    <DialogHeader>
                      <DialogTitle>裁切影像</DialogTitle>
                      <DialogDescription>
                        拖曳選框以裁切您的食物照片。(預設為整張圖)
                      </DialogDescription>
                    </DialogHeader>
                    {originalImageSrc && (
                        <div className="my-4 flex justify-center"> {/* Center the cropper */}
                           {/* Set a max-height for the image inside */}
                            <ReactCrop
                                crop={crop}
                                onChange={(_, percentCrop) => setCrop(percentCrop)}
                                onComplete={(c) => setCompletedCrop(c)}
                                // aspect={CROP_ASPECT} // Remove aspect ratio constraint to allow freeform crop
                                // minWidth={100} // Optional: minimum crop dimensions
                                // minHeight={100}
                                // ruleOfThirds // Optional: show rule of thirds grid
                                // circularCrop // Optional: for circular crop
                            >
                                <img
                                    ref={imgRef}
                                    alt="裁切預覽"
                                    src={originalImageSrc}
                                    onLoad={onImageLoad}
                                    style={{ maxHeight: '60vh', objectFit: 'contain' }} // Limit height
                                    data-ai-hint="食物 盤子"
                                />
                            </ReactCrop>
                        </div>
                    )}
                     {!originalImageSrc && <p>正在載入影像...</p>} {/* Placeholder while loading */}
                    <DialogFooter>
                       <DialogClose asChild>
                        <Button type="button" variant="outline" onClick={handleCropCancel}>
                            取消
                        </Button>
                       </DialogClose>
                      <Button type="button" onClick={handleCropConfirm} disabled={!completedCrop?.width || !completedCrop?.height || isLoading}>
                        {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <Crop className="mr-2 h-4 w-4" />}
                         確認裁切
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>


            {/* Image Preview (after crop/camera, before log) */}
            {!isCameraOpen && imageSrc && !estimationResult && !isLoading && !error && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted/30">
                 <Image
                    src={imageSrc}
                    alt="選取的食物品項"
                    fill // Use fill instead of layout="fill"
                    sizes="(max-width: 768px) 100vw, 50vw" // Add sizes for responsive optimization
                    style={{ objectFit: 'contain' }} // Use style object for objectFit
                    data-ai-hint="食物 盤子"
                    className="rounded-md"
                    priority={true} // Prioritize loading the preview image
                />
                 <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full" onClick={clearAll} aria-label="清除影像">
                    <X size={18} />
                </Button>
              </div>
            )}

             {/* Placeholder when no image, camera, or results and not loading/error */}
             {!isCameraOpen && !imageSrc && !estimationResult && !isLoading && !error && !isCropping && (
                 <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-md text-muted-foreground bg-muted/50 p-4 text-center">
                     <ImageUp size={32} className="mb-2 opacity-50" /> {/* Changed Icon */}
                    <p>預覽畫面會顯示在此</p>
                     <p className="text-xs">開啟相機或上傳照片</p>
                 </div>
            )}

             {/* Buttons area - Conditionally render based on state */}
            {!isCameraOpen && !estimationResult && !isLoading && !error && !isCropping && (
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                    <Button onClick={openCamera} variant="outline" disabled={isLoading} className="w-full sm:w-auto">
                        <Camera className="mr-2 h-4 w-4" /> 開啟相機
                    </Button>
                     {/* Change text based on whether an image is already selected */}
                    <Button onClick={triggerFileInput} variant="outline" disabled={isLoading} className="w-full sm:w-auto">
                        {imageSrc ? "更換照片" : "上傳照片"}
                    </Button>
                    <Input
                        type="file"
                         accept="image/jpeg,image/png,image/webp,image/heic" // Specify accepted types
                         // capture="environment" // Removing capture, let user choose upload/camera via buttons
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={isLoading}
                    />
                </div>
            )}

            {/* Show loading state within this card */}
             {isLoading && !isCameraOpen && !isCropping && ( // Show loading indicator when not in camera/cropping view
                <div className="flex flex-col items-center justify-center p-6 space-y-2">
                    <LoadingSpinner size={32} />
                    <p className="text-muted-foreground">{loadingMessage || '正在處理...'}</p>
                </div>
             )}
             {/* Show error here only if not showing the main estimation error card */}
            {error && !estimationResult && !isCameraOpen && !isCropping && ( // Also hide if camera/cropping is open
                 <div className="mt-4 p-3 border border-destructive bg-destructive/10 rounded-md text-destructive-foreground text-sm flex justify-between items-center">
                    <p>{error}</p>
                    <Button variant="ghost" size="sm" className="text-destructive-foreground underline p-0 h-auto hover:bg-transparent" onClick={clearAll}>關閉</Button>
                 </div>
             )}
          </CardContent>
        </Card>

       {/* Render Estimation/Log Details Card - Show if we have a result OR if there was an error during estimation */}
        { (estimationResult || (error && imageSrc)) && !isCameraOpen && !isCropping && renderEstimationResult()}

       {/* User Profile Card */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><User size={20}/> 您的個人資料</CardTitle>
                <CardDescription>輸入您的資訊以估計每日卡路里需求。(資料儲存在您的瀏覽器中)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 {/* Display profile storage errors */}
                {profileStorageError && (
                     <Alert variant="destructive">
                         <AlertTitle>個人資料儲存錯誤</AlertTitle>
                         <AlertDescription>{profileStorageError.message}</AlertDescription>
                     </Alert>
                 )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="height" className="flex items-center gap-1"><Ruler size={14}/> 身高 (公分)</Label>
                        <Input
                            id="height"
                            type="number"
                            value={userProfile?.height ?? ''} // Handle potential undefined profile
                            onChange={(e) => handleProfileChange('height', e.target.value)}
                            placeholder="例如：175"
                            min="0"
                            aria-label="輸入身高（公分）"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="weight" className="flex items-center gap-1"><Weight size={14}/> 體重 (公斤)</Label>
                        <Input
                            id="weight"
                            type="number"
                            value={userProfile?.weight ?? ''} // Handle potential undefined profile
                            onChange={(e) => handleProfileChange('weight', e.target.value)}
                            placeholder="例如：70"
                            min="0"
                            step="0.1"
                            aria-label="輸入體重（公斤）"
                        />
                    </div>
                </div>
                 <div className="space-y-1">
                    <Label htmlFor="activityLevel" className="flex items-center gap-1"><Activity size={14}/> 活動水平</Label>
                    <Select
                         // Ensure Select has a default empty string value if profile is undefined or null
                        value={userProfile?.activityLevel || ''}
                        onValueChange={(value) => handleProfileChange('activityLevel', value as ActivityLevel | undefined)}
                    >
                        <SelectTrigger id="activityLevel" aria-label="選取活動水平">
                           {/* Ensure placeholder doesn't cause hydration error */}
                           <SelectValue placeholder={isClient ? "選取您的活動水平" : undefined}>
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
                 {/* Display Estimated Needs */}
                {estimatedDailyNeeds !== null && (
                    <div className="pt-2 text-sm text-muted-foreground">
                        估計每日卡路里需求: <strong className="text-primary">{estimatedDailyNeeds} 大卡</strong>
                         <p className="text-xs">(此為粗略估計，僅供參考)</p>
                    </div>
                )}
                 {/* Apple Health Integration Placeholder */}
                 <Button variant="outline" disabled className="w-full mt-2">
                      {/* Placeholder - Apple Health integration requires native capabilities or specific APIs not available in standard web */}
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2"><path d="M12.001 4.5a.75.75 0 01.75.75v1.502a.75.75 0 01-1.5 0V5.25a.75.75 0 01.75-.75zM12 9a.75.75 0 01.75.75v5.495a.75.75 0 01-1.5 0V9.75A.75.75 0 0112 9zm8.036 1.41l1.83 1.22-.001.001A11.95 11.95 0 0112 21.75c-2.672 0-5.153-.873-7.16-2.34l-.005-.003-1.83-1.22a.75.75 0 11.9-1.2l1.83 1.22a10.45 10.45 0 0012.46 0l1.83-1.22a.75.75 0 01.9 1.2zM12 2.25C6.34 2.25 1.75 6.84 1.75 12.5S6.34 22.75 12 22.75 22.25 18.16 22.25 12.5 17.66 2.25 12 2.25zm0 1.5a8.75 8.75 0 100 17.5 8.75 8.75 0 000-17.5z" clipRule="evenodd"></path></svg>
                     連接 Apple 健康 (開發中)
                 </Button>
                 <p className="text-xs text-muted-foreground text-center mt-1">Apple 健康整合需要特定的權限和設定。</p>
            </CardContent>
        </Card>

      </div>

      {/* Right Column: Calorie Log Summary */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 size={20}/> 您的卡路里記錄</CardTitle>
             <CardDescription>
                最近記錄的項目摘要。
                {storageError && ( // Display log storage error here as well
                     <span className="text-destructive ml-2">(錯誤：{storageError.message})</span>
                 )}
             </CardDescription>

          </CardHeader>
          <CardContent>
            {/* Adjust height based on viewport, ensure scrollbar visible */}
            {/* Use h-[calc(100vh-Xrem)] where X is the approximate height of elements above/below */}
             <ScrollArea className="h-[calc(100vh-15rem)] min-h-[300px] pr-3"> {/* Adjust height calculation */}
              {/* Hydration Fix: Only render log content on the client */}
              {!isClient ? (
                 <div className="space-y-6"> {/* Increased spacing for skeleton */}
                     {/* Render Skeletons or placeholder while waiting for client mount */}
                     {[...Array(2)].map((_, index) => (
                        <Card key={index} className="p-4">
                            <Skeleton className="h-5 w-1/3 mb-3 rounded" /> {/* Date Skeleton */}
                             <div className="flex justify-between mb-3">
                                <Skeleton className="h-4 w-1/4 rounded" /> {/* Calories Skeleton */}
                                <Skeleton className="h-4 w-1/4 rounded" /> {/* Amount Skeleton */}
                             </div>
                             {/* Entry Skeletons */}
                             {[...Array(2)].map((_, entryIndex) => (
                                 <div key={entryIndex} className="flex items-start space-x-4 py-2 border-t border-border/50">
                                    <Skeleton className="w-16 h-16 rounded-md flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-3/4 rounded" />
                                        <Skeleton className="h-4 w-1/4 rounded" />
                                        <Skeleton className="h-3 w-1/2 rounded" />
                                        <Skeleton className="h-3 w-2/3 rounded" />
                                    </div>
                                    <Skeleton className="w-8 h-8 rounded-full" />
                                 </div>
                             ))}
                        </Card>
                     ))}
                 </div>
              ) : dailySummaries.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 pt-16"> {/* Added padding top */}
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">您的記錄是空的</p>
                    <p>拍下食物照片開始記錄吧！</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="item-0"> {/* Default open first item */}
                   {dailySummaries.map((summary, index) => {
                       let summaryDate: Date | null = null;
                       try {
                           summaryDate = parseISO(summary.date); // Parse the date string
                           if (!isValid(summaryDate)) { // Check if parsing was successful
                              console.warn(`Invalid date string in summary: ${summary.date}`);
                              summaryDate = null; // Treat as invalid
                           }
                       } catch (e) {
                           console.error(`Error parsing date string in summary: ${summary.date}`, e);
                           summaryDate = null;
                       }

                       return (
                           <AccordionItem key={summary.date} value={`item-${index}`}>
                             <Card className="overflow-hidden"> {/* Apply overflow hidden to card */}
                                <AccordionTrigger className="px-4 py-3 hover:no-underline bg-muted/50">
                                  <div className="flex justify-between items-center w-full">
                                    <span className="font-semibold text-base">
                                      {summaryDate ? format(summaryDate, 'yyyy年MM月dd日') : '無效日期'} {/* Format date safely */}
                                    </span>
                                    <div className="text-sm text-right">
                                      <p className="text-primary">
                                          {/* Safely display total calories */}
                                         {typeof summary.totalCalories === 'number' && !isNaN(summary.totalCalories) ? summary.totalCalories.toFixed(0) : '??'} 大卡
                                      </p>
                                      {summary.totalAmount > 0 && typeof summary.totalAmount === 'number' && !isNaN(summary.totalAmount) && (
                                          <p className="text-muted-foreground">{summary.totalAmount.toFixed(2)} 元</p>
                                      )}
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="border-t border-border max-h-[50vh] overflow-y-auto"> {/* Add max-height and overflow */}
                                  <div className="p-2 sm:p-4 divide-y divide-border"> {/* Adjust padding and add dividers */}
                                    {summary.entries.map((entry) => (
                                        <React.Fragment key={entry.id}>
                                           {renderLogEntry(entry)}
                                        </React.Fragment>
                                    ))}
                                  </div>
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

