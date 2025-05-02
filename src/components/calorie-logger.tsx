
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/loading-spinner';
import { Camera, Trash2, PlusCircle, UtensilsCrossed, X, MapPin, LocateFixed, DollarSign, Coffee, Sun, Moon, Apple, ImageOff, ImageUp, Crop } from 'lucide-react'; // Added ImageUp, Crop
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog'; // Import Dialog components including DialogDescription
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop'; // Import react-image-crop
import 'react-image-crop/dist/ReactCrop.css'; // Import css styles for react-image-crop

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
const mealTypeTranslations: Record<MealType, string> = {
    Breakfast: '早餐',
    Lunch: '午餐',
    Dinner: '晚餐',
    Snack: '點心',
};


// Interface for the data stored in localStorage - re-add imageUrl
interface LogEntryStorage extends Omit<EstimateCalorieCountOutput, 'foodItem'> {
  id: string;
  timestamp: number;
  imageUrl: string; // Re-added to store the compressed image data URI
  foodItem: string; // Editable food item name
  location?: string; // Optional location
  mealType?: MealType; // Meal type
  amount?: number; // Optional amount/cost
}

// Interface used within the component (can include transient data, but now mirrors storage)
// Not strictly needed if LogEntryStorage has everything, but kept for consistency for now.
interface LogEntryDisplay extends LogEntryStorage {
    // No additional fields needed currently
}

// Compression settings
const IMAGE_MAX_WIDTH = 1024; // Max width for the compressed image
const IMAGE_QUALITY = 0.8; // JPEG quality (0 to 1)
const CROP_ASPECT = 16 / 9; // Aspect ratio for the crop tool

// Helper function for centering the crop
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): CropType {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90, // Start with 90% width crop
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

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
            reject(new Error('讀取裁切後的影像資料時失敗。'));
        };
        reader.readAsDataURL(blob);

      },
      'image/jpeg', // Use JPEG for better compression than PNG
      IMAGE_QUALITY // Use the same quality setting
    );
  });
}


export default function CalorieLogger() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null); // For cropper
  const [imageSrc, setImageSrc] = useState<string | null>(null); // For preview after crop/compress AND storing
  const [estimationResult, setEstimationResult] = useState<EstimateCalorieCountOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>(''); // For specific loading messages
  const [error, setError] = useState<string | null>(null);
  // Use the storage-specific type for localStorage
  const [calorieLog, setCalorieLog] = useLocalStorage<LogEntryStorage[]>('calorieLog', []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Used for taking picture
  const imgRef = useRef<HTMLImageElement>(null); // Ref for the image in the cropper
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  // State for editable fields
  const [editedFoodItem, setEditedFoodItem] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [amount, setAmount] = useState<string>(''); // Use string for input

  // State for cropping modal
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<CropType>(); // Crop area state
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>(); // Completed crop state (in pixels)


  // Cleanup camera stream on unmount or when camera is closed
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

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
    // Set the initial crop area centered with the defined aspect ratio
     if (width > 0 && height > 0) { // Ensure dimensions are valid
      setCrop(centerAspectCrop(width, height, CROP_ASPECT));
     } else {
         console.warn("Image dimensions are zero on load, cannot set initial crop.");
         // Optionally, set a default crop or wait for valid dimensions
         setCrop({ unit: '%', width: 50, height: 50, x: 25, y: 25 }); // Example fallback
     }
  }

   // Handle the crop confirmation
  const handleCropConfirm = async () => {
    if (completedCrop?.width && completedCrop?.height && imgRef.current && originalImageSrc) {
      setIsLoading(true);
      setLoadingMessage('正在裁切並壓縮影像...');
      setIsCropping(false); // Close modal immediately

      try {
        // Get the cropped image data URL (already compressed by getCroppedImg)
        const croppedDataUrl = await getCroppedImg(
          imgRef.current,
          completedCrop
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
            description: "請選取要裁切的區域。",
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
    // Check for imageSrc being present as it's now required for the log entry
    if (estimationResult && editedFoodItem && editedFoodItem.trim() && imageSrc) {
      const parsedAmount = parseFloat(amount);
      // Create entry based on the storage interface (now includes imageUrl)
      const newLogEntry: LogEntryStorage = {
        // Spread only the properties needed for storage
        calorieEstimate: estimationResult.calorieEstimate,
        confidence: estimationResult.confidence,
        // Do not include the original `foodItem` from estimationResult if using editedFoodItem
        foodItem: editedFoodItem.trim(), // Use the trimmed edited name
        id: Date.now().toString(),
        timestamp: Date.now(),
        imageUrl: imageSrc, // STORE the compressed image data URI
        location: location || undefined, // Use location from state
        mealType: mealType, // Use meal type from state
        amount: !isNaN(parsedAmount) ? parsedAmount : undefined, // Use amount from state
      };

      // Log the entry
      try {
          // Limit the log size (e.g., keep only the latest 100 entries)
          const MAX_LOG_ENTRIES = 100; // Keep this relatively low due to image data size
          const updatedLog = [newLogEntry, ...calorieLog].slice(0, MAX_LOG_ENTRIES);
          setCalorieLog(updatedLog);

          // Clear the current image and results/fields after logging
          clearAll(); // Use the clearAll function
          toast({
              title: "記錄成功",
              description: `${newLogEntry.foodItem} (${estimationResult.calorieEstimate} 大卡) 已新增至您的記錄中。`,
          });
      } catch (e) {
           console.error("儲存至 localStorage 時發生錯誤:", e);

           // Check if it's our custom LocalStorageError related to quota
           if (e instanceof LocalStorageError && (e.message.includes('quota exceeded') || e.message.includes('Failed to execute \'setItem\''))) {
                 toast({
                    title: "記錄錯誤",
                    description: "無法儲存此項目。瀏覽器儲存空間可能已滿。請嘗試清除部分記錄。",
                    variant: "destructive",
                     duration: 7000,
                });
               // Consider adding a button/action to manually clear older entries
               // Automatic deletion can be risky, especially with image data.
               // Example: Provide a button in the UI to "Clear Oldest 10 Entries"
           } else {
               // Handle other potential errors during setCalorieLog or JSON stringify
                toast({
                    title: "記錄錯誤",
                    description: `儲存項目時發生未預期的錯誤: ${e instanceof Error ? e.message : 'Unknown error'}`,
                    variant: "destructive",
                });
           }
      }

    } else {
         let errorDesc = "沒有可記錄的估計結果。";
         if (!editedFoodItem || !editedFoodItem.trim()) {
             errorDesc = "食物品項名稱不可為空。";
         } else if (!imageSrc) {
             errorDesc = "缺少影像資料無法記錄。"; // Add check for missing image
         }
         toast({
            title: "記錄錯誤",
            description: errorDesc,
            variant: "destructive",
         });
    }
  };


  const deleteLogEntry = (id: string) => {
    try {
        setCalorieLog(calorieLog.filter(entry => entry.id !== id));
        toast({
            title: "記錄項目已刪除",
            description: "所選項目已從您的記錄中移除。",
        });
    } catch (e) {
        console.error("刪除記錄項目時發生錯誤:", e);
        toast({
            title: "刪除錯誤",
            description: `移除項目時發生錯誤: ${e instanceof Error ? e.message : 'Unknown error'}`,
            variant: "destructive",
        });
    }
};


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

            {/* Read-only Calorie Estimate & Confidence */}
             <div className="flex justify-between text-sm pt-2">
                <p><strong className="font-medium">估計卡路里：</strong> {estimationResult.calorieEstimate} 大卡</p>
                 {/* Conditional rendering for confidence */}
                <p className={estimationResult.confidence < 0.7 ? 'text-orange-600' : ''}>
                    <strong className="font-medium">信賴度：</strong>
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
            <Button onClick={logCalories} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto flex-1 sm:flex-none" disabled={!editedFoodItem || !editedFoodItem.trim() || isLoading || !imageSrc}> {/* Disable if no image */}
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


  return (
    <div className="flex flex-col md:flex-row gap-8">
       {/* Left Column: Image Capture & Estimation */}
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
                        拖曳選框以裁切您的食物照片。
                      </DialogDescription>
                    </DialogHeader>
                    {originalImageSrc && (
                        <div className="my-4 flex justify-center"> {/* Center the cropper */}
                           {/* Set a max-height for the image inside */}
                            <ReactCrop
                                crop={crop}
                                onChange={(_, percentCrop) => setCrop(percentCrop)}
                                onComplete={(c) => setCompletedCrop(c)}
                                aspect={CROP_ASPECT}
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


      </div>

      {/* Right Column: Calorie Log */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>您的卡路里記錄</CardTitle>
            <CardDescription>最近記錄的項目。</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Adjust height based on viewport, ensure scrollbar visible */}
             <ScrollArea className="h-[calc(100vh-250px)] min-h-[400px] pr-3"> {/* Example height, adjust as needed */}
              {calorieLog.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 pt-16"> {/* Added padding top */}
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">您的記錄是空的</p>
                    <p>拍下食物照片開始記錄吧！</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Map over LogEntryStorage, which now includes imageUrl */}
                  {calorieLog.map((entry, index) => ( // Add index
                    <React.Fragment key={entry.id}> {/* Use Fragment */}
                      <div className="flex items-start space-x-4">
                        {/* Display Image or Placeholder */}
                         <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-md bg-muted border text-muted-foreground flex-shrink-0 overflow-hidden"> {/* Fixed size and overflow hidden */}
                            {entry.imageUrl ? (
                                <Image
                                    src={entry.imageUrl}
                                    alt={`記錄項目：${entry.foodItem}`}
                                    fill // Use fill to cover the container
                                    sizes="(max-width: 640px) 4rem, 5rem" // Provide sizes hint
                                    style={{ objectFit: 'cover' }} // Cover the area
                                    className="rounded-md"
                                    data-ai-hint="食物 盤子"
                                    // Consider adding loading="lazy" for log images
                                    loading="lazy"
                                    // Add error handling for images that might fail to load (e.g., if data URI is corrupted)
                                    onError={(e) => {
                                        // Optionally replace with placeholder on error
                                        (e.target as HTMLImageElement).src = ''; // Clear src
                                        (e.target as HTMLImageElement).style.display = 'none'; // Hide broken image icon
                                        // You might want to show the ImageOff icon here instead programmatically
                                    }}
                                />
                            ) : (
                               <ImageOff size={32} aria-label="無可用影像"/>
                            )}
                        </div>

                        <div className="flex-1 space-y-1 overflow-hidden"> {/* Prevent text overflow */}
                            <p className="font-semibold text-base truncate">{entry.foodItem}</p> {/* Truncate long names */}
                            <p className="text-sm text-primary">{entry.calorieEstimate} 大卡</p>

                             <div className="text-xs text-muted-foreground space-y-0.5">
                                 {/* Combine Meal Type and Time */}
                                 <div className="flex items-center flex-wrap gap-x-2">
                                    {entry.mealType && (
                                        <div className="flex items-center">
                                            {renderMealIcon(entry.mealType)}
                                            <span>{mealTypeTranslations[entry.mealType]}</span> {/* Use translated text */}
                                        </div>
                                    )}
                                     <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                    <span>({new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })})</span>
                                 </div>

                                {entry.location && (
                                    <div className="flex items-center">
                                        <MapPin className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" /> {/* Prevent shrinking */}
                                        <span className="truncate">{entry.location}</span> {/* Truncate long locations */}
                                    </div>
                                )}
                                {entry.amount !== undefined && entry.amount !== null && (
                                    <div className="flex items-center">
                                        <DollarSign className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" />
                                        {/* Ensure amount is treated as number and formatted */}
                                        <span>{(typeof entry.amount === 'number' ? entry.amount.toFixed(2) : 'N/A')} 元</span> {/* Added currency unit */}
                                    </div>
                                )}
                                {/* <p> Confidence: {Math.round(entry.confidence * 100)}% </p> */} {/* Optional: Show confidence */}

                             </div>

                        </div>
                        {/* Delete Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLogEntry(entry.id)}
                            className="text-destructive hover:bg-destructive/10 mt-1 shrink-0 self-start" // Align top
                            aria-label={`刪除 ${entry.foodItem} 的記錄項目`}
                            title={`刪除 ${entry.foodItem}`} // Tooltip
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Add separator only if it's not the last item */}
                      {index < calorieLog.length - 1 && (
                         <Separator className="my-4" />
                      )}
                    </React.Fragment> // Close Fragment
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

