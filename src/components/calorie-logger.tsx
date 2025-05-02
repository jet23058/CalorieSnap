
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { estimateCalorieCount, type EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count';
import useLocalStorage, { LocalStorageError } from '@/hooks/use-local-storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/loading-spinner';
import { Camera, Trash2, PlusCircle, UtensilsCrossed, X, MapPin, LocateFixed, DollarSign, Coffee, Sun, Moon, Apple, ImageOff } from 'lucide-react';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
const mealTypeTranslations: Record<MealType, string> = {
    Breakfast: '早餐',
    Lunch: '午餐',
    Dinner: '晚餐',
    Snack: '點心',
};

// Interface for the data stored in localStorage - remove imageUrl
interface LogEntryStorage extends Omit<EstimateCalorieCountOutput, 'foodItem'> {
  id: string;
  timestamp: number;
  foodItem: string; // Editable food item name
  location?: string; // Optional location
  mealType?: MealType; // Meal type
  amount?: number; // Optional amount/cost
}

// Interface used within the component (can include transient data like imageUrl)
interface LogEntryDisplay extends LogEntryStorage {
    imageUrl?: string; // Keep for display purposes
}

// Image Processing Constants
const MAX_IMAGE_WIDTH = 1024; // Max width/height for resizing
const IMAGE_QUALITY = 0.85; // JPEG quality (0 to 1)

export default function CalorieLogger() {
  const [imageSrc, setImageSrc] = useState<string | null>(null); // For preview
  const [processedImageSrc, setProcessedImageSrc] = useState<string | null>(null); // Compressed/resized
  const [estimationResult, setEstimationResult] = useState<EstimateCalorieCountOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calorieLog, setCalorieLog] = useLocalStorage<LogEntryStorage[]>('calorieLog', []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Re-purposed for compression/resizing
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  // State for editable fields
  const [editedFoodItem, setEditedFoodItem] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [amount, setAmount] = useState<string>('');

  // Cleanup camera stream on unmount or when camera is closed
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

    // Helper function to resize and compress image using canvas
    const resizeAndCompressImage = useCallback((dataUri: string, maxWidth: number = MAX_IMAGE_WIDTH, quality: number = IMAGE_QUALITY): Promise<string> => {
        return new Promise((resolve, reject) => {
            setIsProcessingImage(true);
            const img = document.createElement('img');
            img.onload = () => {
                const canvas = canvasRef.current; // Use the existing canvas ref
                const ctx = canvas?.getContext('2d');

                if (!canvas || !ctx) {
                    setIsProcessingImage(false);
                    return reject(new Error("無法取得畫布內容以調整影像大小。"));
                }

                let { width, height } = img;
                const aspectRatio = width / height;

                if (width > height) {
                    if (width > maxWidth) {
                        width = maxWidth;
                        height = Math.round(width / aspectRatio);
                    }
                } else {
                    if (height > maxWidth) {
                        height = maxWidth;
                        width = Math.round(height * aspectRatio);
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Get compressed data URI as JPEG
                let compressedUri: string;
                try {
                    compressedUri = canvas.toDataURL('image/jpeg', quality);
                     // Optional: Fallback to png if jpeg fails? unlikely but possible
                     if (!compressedUri || compressedUri === 'data:,') {
                        console.warn("toDataURL('image/jpeg') failed, falling back to png.");
                        compressedUri = canvas.toDataURL('image/png');
                    }
                } catch (e) {
                     console.error("Error creating data URL from canvas:", e);
                     setIsProcessingImage(false);
                     return reject(new Error("無法處理拍攝的影像。"));
                }


                 if (!compressedUri || compressedUri === 'data:,') {
                     console.error("Failed to get data URI from canvas.");
                     setIsProcessingImage(false);
                     return reject(new Error("無法從相機擷取有效的影像。"));
                 }

                const originalSizeKB = (dataUri.length * (3/4) / 1024).toFixed(1);
                const compressedSizeKB = (compressedUri.length * (3/4) / 1024).toFixed(1);
                console.log(`影像已調整大小/壓縮: ${originalSizeKB} KB -> ${compressedSizeKB} KB (Quality: ${quality * 100}%, MaxWidth: ${maxWidth}px)`);

                // Optionally, add a small delay to show processing state
                // setTimeout(() => {
                    setIsProcessingImage(false);
                    resolve(compressedUri);
                // }, 300);


            };
            img.onerror = (error) => {
                console.error("載入影像以進行調整大小/壓縮時發生錯誤:", error);
                setIsProcessingImage(false);
                reject(new Error("載入影像以進行處理時發生錯誤。"));
            };
            img.src = dataUri; // Start loading the image
        });
    }, [toast]); // Added toast as dependency

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
        console.error(`取得地點時發生錯誤: ${geoError.message || 'No message'} (代碼: ${geoError.code || 'No code'})`);

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

   const handleImageSelected = async (dataUri: string) => {
        setImageSrc(dataUri); // Show original preview immediately
        clearEstimation();
        setProcessedImageSrc(null); // Clear previous processed image

        try {
            const compressedUri = await resizeAndCompressImage(dataUri);
            setProcessedImageSrc(compressedUri); // Store compressed URI
            estimateCalories(compressedUri); // Start estimation with compressed image
        } catch (processError) {
            console.error("影像處理失敗:", processError);
            setError(`影像處理失敗: ${processError instanceof Error ? processError.message : '未知錯誤'}`);
            toast({
                title: "影像處理失敗",
                description: processError instanceof Error ? processError.message : "無法處理您的影像。",
                variant: "destructive",
            });
            setIsProcessingImage(false); // Ensure loading state is turned off
            setImageSrc(null); // Clear preview on error
        }
    };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        handleImageSelected(result);
      };
      reader.readAsDataURL(file);
    }
    // Reset file input to allow selecting the same file again
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const openCamera = async () => {
    setError(null);
    setImageSrc(null);
    setProcessedImageSrc(null);
    clearEstimation();
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' } }
      };
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn("環境攝影機失敗，嘗試預設:", err);
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play().catch(playError => {
            console.error("影片播放失敗:", playError);
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
     // Use a temporary canvas for snapshotting if main canvas is for resizing
     const snapshotCanvas = document.createElement('canvas');
    if (videoRef.current && snapshotCanvas && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) { // Check readyState
      const video = videoRef.current;
      // const canvas = canvasRef.current; // Main canvas is for resizing now

      // Match canvas dimensions to video's actual dimensions
       const videoWidth = video.videoWidth;
       const videoHeight = video.videoHeight;

       if (videoWidth === 0 || videoHeight === 0) {
          console.error("影片尺寸為零，尚無法拍照。");
           toast({ title: "拍攝錯誤", description: "相機畫面尚未就緒。", variant: "destructive" });
           return; // Exit if dimensions aren't ready
       }

      snapshotCanvas.width = videoWidth;
      snapshotCanvas.height = videoHeight;
      const context = snapshotCanvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

        // Get the image data from the SNAPSHOT canvas
        let dataUri: string;
        try {
           // Use png initially for snapshot to avoid immediate quality loss before resizing
           dataUri = snapshotCanvas.toDataURL('image/png');
        } catch (e) {
             console.error("從畫布建立資料 URL 時發生錯誤:", e);
             toast({ title: "拍攝錯誤", description: "無法處理拍攝的影像。", variant: "destructive" });
             closeCamera();
             return;
        }

         if (!dataUri || dataUri === 'data:,') {
             console.error("無法從畫布取得資料 URI。");
             toast({ title: "拍攝錯誤", description: "無法從相機擷取有效的影像。", variant: "destructive" });
             closeCamera();
             return;
         }

        // Successfully captured image
        closeCamera(); // Close camera after taking picture
        handleImageSelected(dataUri); // Process and estimate the captured image

      } else {
          setError("無法取得畫布內容。");
          toast({ title: "拍攝錯誤", description: "無法從相機拍攝影像。", variant: "destructive" });
          closeCamera();
      }
    } else {
        let errorMsg = "相機或畫布尚未就緒。";
        if (videoRef.current && videoRef.current.readyState < videoRef.current.HAVE_CURRENT_DATA) {
           errorMsg = "相機畫面仍在載入中。";
        }
        setError(errorMsg);
        toast({ title: "拍攝錯誤", description: errorMsg, variant: "destructive" });
        closeCamera();
    }
  };


  const clearEstimation = () => {
     setEstimationResult(null);
     setError(null);
     setEditedFoodItem('');
     setLocation('');
     setMealType(undefined);
     setAmount('');
  }

  const estimateCalories = useCallback(async (photoDataUri: string) => {
    // Now using the already processed/compressed image URI
    if (!photoDataUri) {
        setError("沒有要估算的影像。");
        return;
    }

    setIsLoading(true);
    setError(null);
    setEstimationResult(null);

    try {
      // Size check is less critical now, but can still be useful
      const sizeInMB = (photoDataUri.length * (3/4)) / (1024 * 1024);
      console.log(`正在估算影像大小: ${sizeInMB.toFixed(2)}MB`); // Log compressed size
       if (sizeInMB > 3.8) { // Even compressed, maybe warn if still large
            console.warn(`壓縮後的影像大小 (${sizeInMB.toFixed(2)}MB) 仍然很大。`);
             toast({
                title: "影像仍然很大",
                description: "壓縮後的影像檔案大小仍然較大，可能影響效能。",
                variant: "default",
                duration: 4000,
            });
       }

      const result = await estimateCalorieCount({ photoDataUri });

      if (result.confidence < 0.5) {
         toast({
          title: "低信賴度估計",
          description: "影像可能不清晰，或難以辨識食物品項。卡路里估計值可能較不準確。",
          variant: "default",
          duration: 5000,
        });
      }

      setEstimationResult(result);
      setEditedFoodItem(result.foodItem);
      fetchCurrentLocation();

    } catch (err) {
      console.error("估計卡路里時發生錯誤:", err);
      let errorMsg = "無法估計卡路里。請再試一次。";
      if (err instanceof Error) {
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
    }
  }, [toast, fetchCurrentLocation]); // Removed resize/compress logic from here

  const logCalories = () => {
    if (estimationResult && editedFoodItem && editedFoodItem.trim()) {
      const parsedAmount = parseFloat(amount);
      const newLogEntry: LogEntryStorage = {
        calorieEstimate: estimationResult.calorieEstimate,
        confidence: estimationResult.confidence,
        foodItem: editedFoodItem.trim(),
        id: Date.now().toString(),
        timestamp: Date.now(),
        location: location || undefined,
        mealType: mealType,
        amount: !isNaN(parsedAmount) ? parsedAmount : undefined,
      };

      try {
          const MAX_LOG_ENTRIES = 100;
          const updatedLog = [newLogEntry, ...calorieLog].slice(0, MAX_LOG_ENTRIES);
          setCalorieLog(updatedLog);

          setImageSrc(null);
          setProcessedImageSrc(null); // Clear processed image too
          clearEstimation();
          toast({
              title: "記錄成功",
              description: `${newLogEntry.foodItem} (${estimationResult.calorieEstimate} 大卡) 已新增至您的記錄中。`,
          });
      } catch (e) {
           console.error("儲存至 localStorage 時發生錯誤:", e);
           if (e instanceof LocalStorageError && (e.message.includes('quota exceeded') || e.message.includes('Failed to execute \'setItem\''))) {
                 toast({
                    title: "記錄錯誤",
                    description: "無法儲存此項目。瀏覽器儲存空間可能已滿。請嘗試清除部分記錄。",
                    variant: "destructive",
                     duration: 7000,
                });
           } else {
                toast({
                    title: "記錄錯誤",
                    description: `儲存項目時發生未預期的錯誤: ${e instanceof Error ? e.message : 'Unknown error'}`,
                    variant: "destructive",
                });
           }
      }

    } else {
         toast({
            title: "記錄錯誤",
            description: !editedFoodItem || !editedFoodItem.trim() ? "食物品項名稱不可為空。" : "沒有可記錄的估計結果。",
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
    if (isProcessingImage) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
            <LoadingSpinner size={32} />
            <p className="text-muted-foreground">正在處理影像...</p>
          </CardContent>
        </Card>
      );
    }

    if (isLoading) { // API call loading
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
            <LoadingSpinner size={32} />
            <p className="text-muted-foreground">正在估計卡路里...</p>
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
         <Card className="border-destructive bg-destructive/10">
             <CardHeader>
                 <CardTitle className="text-destructive flex items-center gap-2"><X size={20}/> 估計錯誤</CardTitle>
             </CardHeader>
             <CardContent>
                <p className="text-destructive-foreground">{error}</p>
             </CardContent>
             <CardFooter>
                 <Button variant="ghost" className="text-destructive-foreground underline" onClick={() => { setError(null); clearEstimation(); setImageSrc(null); setProcessedImageSrc(null); }}>關閉</Button>
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
            {/* Use original image for preview */}
            {imageSrc && (
                <div className="relative aspect-video w-full overflow-hidden rounded-md border mb-4 bg-muted/30">
                  <Image
                    src={imageSrc} // Show original high-res preview
                    alt="食物品項預覽"
                    layout="fill"
                    objectFit="contain"
                    data-ai-hint="食物 盤子"
                    className="rounded-md"
                  />
                </div>
            )}

            <div className="space-y-1">
                <Label htmlFor="foodItem">食物品項 <span className="text-destructive">*</span></Label>
                <Input
                    id="foodItem"
                    value={editedFoodItem}
                    onChange={(e) => setEditedFoodItem(e.target.value)}
                    placeholder="例如：雞肉沙拉"
                    aria-required="true"
                />
            </div>

             <div className="flex justify-between text-sm pt-2">
                <p><strong className="font-medium">估計卡路里：</strong> {estimationResult.calorieEstimate} 大卡</p>
                <p className={estimationResult.confidence < 0.7 ? 'text-orange-600' : ''}>
                    <strong className="font-medium">信賴度：</strong>
                    {Math.round(estimationResult.confidence * 100)}%
                     {estimationResult.confidence < 0.5 && <span className="ml-1 text-xs">(低)</span>}
                </p>
            </div>

             <Separator className="my-3"/>

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
                        aria-label={isFetchingLocation ? "正在取得目前位置" : "取得目前位置"}
                        title={isFetchingLocation ? "正在取得..." : "取得目前位置"}
                        >
                        {isFetchingLocation ? <LoadingSpinner size={16}/> : <LocateFixed className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

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
                             if (val === '' || (/^\d*\.?\d*$/.test(val) && parseFloat(val) >= 0) || val === '.') {
                                setAmount(val);
                             }
                        }}
                        onBlur={(e) => {
                            const num = parseFloat(e.target.value);
                            if (!isNaN(num) && num >= 0) {
                                setAmount(num.toFixed(2));
                            } else if (e.target.value !== '' && e.target.value !== '.') {
                                // setAmount(''); // Optional clear invalid
                            }
                        }}
                        placeholder="0.00"
                        className="pl-8"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                         aria-label="輸入金額或費用"
                    />
                </div>
            </div>

          </CardContent>
          <CardFooter className="flex-col sm:flex-row gap-2 pt-4">
            <Button onClick={logCalories} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto flex-1 sm:flex-none" disabled={!editedFoodItem || !editedFoodItem.trim() || isLoading || isProcessingImage}>
              {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <PlusCircle className="mr-2 h-4 w-4" />}
               記錄卡路里
            </Button>
             <Button variant="outline" onClick={() => { setImageSrc(null); setProcessedImageSrc(null); clearEstimation(); }} className="w-full sm:w-auto">
                取消
            </Button>
          </CardFooter>
        </Card>
      );
    }
    return null;
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
                    <video ref={videoRef} playsInline muted className="w-full rounded-md border aspect-video object-cover bg-muted"></video>
                    <Button
                        onClick={takePicture}
                        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 h-auto shadow-lg z-10 border-2 border-background"
                        aria-label="拍攝照片"
                        disabled={isLoading || isProcessingImage} // Disable while loading or processing
                        >
                        <Camera size={24} />
                    </Button>
                     <Button onClick={closeCamera} variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full z-10" aria-label="關閉相機">
                        <X size={18} />
                    </Button>
                </div>
            )}
             {/* Canvas for resizing/compression (always needed, but hidden) */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

            {/* Image Preview (shows original image) */}
            {/* Only show preview if camera is closed, image is loaded, AND not currently showing estimation/log details */}
            {!isCameraOpen && imageSrc && !estimationResult && !isLoading && !isProcessingImage && !error && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted/30">
                <Image
                    src={imageSrc} // Always show original for preview
                    alt="選取的食物品項"
                    layout="fill"
                    objectFit="contain"
                    data-ai-hint="食物 盤子"
                    className="rounded-md"
                />
                 <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full" onClick={() => {setImageSrc(null); setProcessedImageSrc(null); clearEstimation();}} aria-label="清除影像">
                    <X size={18} />
                </Button>
              </div>
            )}

             {/* Placeholder */}
             {!isCameraOpen && !imageSrc && !estimationResult && !isLoading && !isProcessingImage && !error && (
                 <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-md text-muted-foreground bg-muted/50 p-4 text-center">
                     <Camera size={32} className="mb-2 opacity-50" />
                    <p>預覽畫面會顯示在此</p>
                     <p className="text-xs">開啟相機或上傳照片</p>
                 </div>
            )}

             {/* Buttons area */}
            {/* Show buttons only if camera is closed AND estimation card isn't shown */}
            {!isCameraOpen && (!estimationResult && !isLoading && !isProcessingImage && !error) && (
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                    <Button onClick={openCamera} variant="outline" disabled={isLoading || isProcessingImage} className="w-full sm:w-auto">
                        <Camera className="mr-2 h-4 w-4" /> 開啟相機
                    </Button>
                    <Button onClick={triggerFileInput} variant="outline" disabled={isLoading || isProcessingImage} className="w-full sm:w-auto">
                        {imageSrc ? "更換照片" : "上傳照片"}
                    </Button>
                    <Input
                        type="file"
                         accept="image/jpeg,image/png,image/webp,image/heic"
                         capture="environment"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={isLoading || isProcessingImage}
                    />
                </div>
            )}

            {/* Loading/Error within this card only if estimation card isn't shown */}
             {(isProcessingImage || isLoading) && !estimationResult && (
                <div className="flex flex-col items-center justify-center p-6 space-y-2">
                    <LoadingSpinner size={32} />
                    <p className="text-muted-foreground">{isProcessingImage ? '正在處理影像...' : '正在估計卡路里...'}</p>
                </div>
             )}
            {error && !estimationResult && (
                 <div className="mt-4 p-3 border border-destructive bg-destructive/10 rounded-md text-destructive-foreground text-sm flex justify-between items-center">
                    <p>{error}</p>
                    <Button variant="ghost" size="sm" className="text-destructive-foreground underline p-0 h-auto hover:bg-transparent" onClick={() => { setError(null); clearEstimation(); setImageSrc(null); setProcessedImageSrc(null); }}>關閉</Button>
                 </div>
             )}
          </CardContent>
        </Card>

       {/* Render Estimation/Log Details Card */}
        {/* Render this card if: image is processed OR loading OR error OR estimation result exists, AND camera is closed */}
        { (processedImageSrc || isLoading || error || estimationResult) && !isCameraOpen && renderEstimationResult()}

      </div>

      {/* Right Column: Calorie Log */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>您的卡路里記錄</CardTitle>
            <CardDescription>最近記錄的項目。</CardDescription>
          </CardHeader>
          <CardContent>
             <ScrollArea className="h-[calc(100vh-250px)] min-h-[400px] pr-3">
              {calorieLog.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 pt-16">
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">您的記錄是空的</p>
                    <p>拍下食物照片開始記錄吧！</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {calorieLog.map((entry, index) => (
                    <React.Fragment key={entry.id}>
                      <div className="flex items-start space-x-4">
                         <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-md bg-muted border text-muted-foreground flex-shrink-0">
                           <ImageOff size={32} aria-label="無可用影像"/>
                        </div>

                        <div className="flex-1 space-y-1 overflow-hidden">
                            <p className="font-semibold text-base truncate">{entry.foodItem}</p>
                            <p className="text-sm text-primary">{entry.calorieEstimate} 大卡</p>

                             <div className="text-xs text-muted-foreground space-y-0.5">
                                 <div className="flex items-center flex-wrap gap-x-2">
                                    {entry.mealType && (
                                        <div className="flex items-center">
                                            {renderMealIcon(entry.mealType)}
                                            <span>{mealTypeTranslations[entry.mealType]}</span>
                                        </div>
                                    )}
                                     <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                    <span>({new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })})</span>
                                 </div>

                                {entry.location && (
                                    <div className="flex items-center">
                                        <MapPin className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" />
                                        <span className="truncate">{entry.location}</span>
                                    </div>
                                )}
                                {entry.amount !== undefined && entry.amount !== null && (
                                    <div className="flex items-center">
                                        <DollarSign className="h-3.5 w-3.5 inline-block mr-1 flex-shrink-0" />
                                        <span>{(typeof entry.amount === 'number' ? entry.amount.toFixed(2) : 'N/A')} 元</span>
                                    </div>
                                )}
                             </div>

                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLogEntry(entry.id)}
                            className="text-destructive hover:bg-destructive/10 mt-1 shrink-0 self-start"
                            aria-label={`刪除 ${entry.foodItem} 的記錄項目`}
                            title={`刪除 ${entry.foodItem}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {index < calorieLog.length - 1 && (
                         <Separator className="my-4" />
                      )}
                    </React.Fragment>
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
