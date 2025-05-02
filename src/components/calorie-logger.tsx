
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { estimateCalorieCount, type EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count';
import useLocalStorage, { LocalStorageError } from '@/hooks/use-local-storage'; // Import error class
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/loading-spinner';
import { Camera, Trash2, PlusCircle, UtensilsCrossed, X, MapPin, LocateFixed, DollarSign, Coffee, Sun, Moon, Apple, ImageOff } from 'lucide-react'; // Added ImageOff

type MealType = '早餐' | '午餐' | '晚餐' | '點心'; // Translated Meal Types

// Interface for the data stored in localStorage - remove imageUrl
interface LogEntryStorage extends Omit<EstimateCalorieCountOutput, 'foodItem'> {
  id: string;
  timestamp: number;
  // imageUrl: string; // Removed to save space
  foodItem: string; // Editable food item name
  location?: string; // Optional location
  mealType?: MealType; // Meal type
  amount?: number; // Optional amount/cost
}

// Interface used within the component (can include transient data like imageUrl)
interface LogEntryDisplay extends LogEntryStorage {
    imageUrl?: string; // Keep for potential display if needed elsewhere, but not stored
}


export default function CalorieLogger() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [estimationResult, setEstimationResult] = useState<EstimateCalorieCountOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Use the storage-specific type for localStorage
  const [calorieLog, setCalorieLog] = useLocalStorage<LogEntryStorage[]>('calorieLog', []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  // State for editable fields
  const [editedFoodItem, setEditedFoodItem] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [amount, setAmount] = useState<string>(''); // Use string for input

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
        title: "地理位置錯誤", // Translated
        description: "您的瀏覽器不支援地理位置功能。", // Translated
        variant: "destructive",
      });
      return;
    }

    setIsFetchingLocation(true);
    setLocation('正在取得位置...'); // Translated

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Basic approach: just show coordinates. A real app might use reverse geocoding API.
        // const locString = `Lat: ${position.coords.latitude.toFixed(4)}, Lon: ${position.coords.longitude.toFixed(4)}`;
        const locString = "目前位置"; // Simplified for demo - Translated
        setLocation(locString);
        setIsFetchingLocation(false);
        toast({
            title: "已取得位置", // Translated
            description: "已設定目前位置。", // Translated
        });
      },
      (error) => {
        console.error("取得位置時發生錯誤:", error); // Translated
        let description = "無法取得您的位置。"; // Translated
        if (error.code === error.PERMISSION_DENIED) {
            description = "地點權限遭拒。請在您的瀏覽器設定中啟用。"; // Translated
        } else if (error.code === error.POSITION_UNAVAILABLE) {
            description = "無法取得地點資訊。"; // Translated
        } else if (error.code === error.TIMEOUT) {
            description = "取得使用者位置的要求已逾時。"; // Translated
        }
        setLocation(''); // Clear placeholder on error
        setIsFetchingLocation(false);
        toast({
          title: "地點錯誤", // Translated
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
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Limit image size before processing? (Future enhancement)
        setImageSrc(result);
        clearEstimation(); // Clear previous results and fields
        estimateCalories(result); // Start estimation immediately
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
    clearEstimation();
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraOpen(true);
    } catch (err) {
      console.error("無法存取相機:", err); // Translated
      setError("無法存取相機。請檢查權限。"); // Translated
      toast({
        title: "相機錯誤", // Translated
        description: "無法存取相機。請確認已授予權限。", // Translated
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
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        // Consider resizing/compressing image here (Future enhancement)
        // Example: context.drawImage(video, 0, 0, desiredWidth, desiredHeight);
        // const dataUri = canvas.toDataURL('image/jpeg', 0.8); // Quality adjustment
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL('image/jpeg');
        setImageSrc(dataUri);
        clearEstimation();
        closeCamera();
        estimateCalories(dataUri);
      } else {
          setError("無法取得畫布內容。"); // Translated
          toast({ title: "拍攝錯誤", description: "無法從相機拍攝影像。", variant: "destructive" }); // Translated
      }
    } else {
        setError("相機或畫布尚未就緒。"); // Translated
        toast({ title: "拍攝錯誤", description: "相機畫面無法使用。", variant: "destructive" }); // Translated
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
    setIsLoading(true);
    setError(null);
    setEstimationResult(null);

    try {
      // Add check for data URI length before sending? (Future enhancement)
      if (photoDataUri.length > 4 * 1024 * 1024) { // Example: Check if > ~4MB
          console.warn("圖片資料 URI 可能過大。"); // Translated
          // Potentially resize/compress before sending to AI
      }

      const result = await estimateCalorieCount({ photoDataUri });

      if (result.confidence < 0.5) {
         toast({
          title: "低信賴度估計", // Translated
          description: "影像可能不清楚，或食物項目難以識別。卡路里估計可能較不準確。", // Translated
          variant: "default",
          duration: 5000, // Show longer
        });
      }

      setEstimationResult(result);
      setEditedFoodItem(result.foodItem); // Pre-fill editable name
      fetchCurrentLocation(); // Attempt to fetch location after getting result

    } catch (err) {
      console.error("估算卡路里時發生錯誤:", err); // Translated
      let errorMsg = "無法估算卡路里。請再試一次。"; // Translated
      if (err instanceof Error) {
        // Check for specific known error types if possible
         if (err.message.includes("quota") || err.message.includes("size")) {
            errorMsg = "無法估算卡路里。影像可能太大或網路發生問題。"; // Translated
         } else {
             errorMsg = `無法估算卡路里：${err.message}`; // Translated
         }
      }
      setError(errorMsg);
       toast({
        title: "估計失敗", // Translated
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchCurrentLocation]); // Added fetchCurrentLocation dependency

  const logCalories = () => {
    // No longer need imageSrc check here as it's not stored
    if (estimationResult && editedFoodItem) { // Ensure editedFoodItem is not empty
      const parsedAmount = parseFloat(amount);
      // Create entry based on the storage interface (no imageUrl)
      const newLogEntry: LogEntryStorage = {
        // Spread only the properties needed for storage
        calorieEstimate: estimationResult.calorieEstimate,
        confidence: estimationResult.confidence,
        // Do not include the original `foodItem` from estimationResult if using editedFoodItem
        foodItem: editedFoodItem, // Use the edited name
        id: Date.now().toString(),
        timestamp: Date.now(),
        // imageUrl: imageSrc, // DO NOT STORE IMAGE URL
        location: location || undefined, // Use location from state
        mealType: mealType, // Use meal type from state
        amount: !isNaN(parsedAmount) ? parsedAmount : undefined, // Use amount from state
      };

      // Log the entry without the image data
      try {
          // Limit the log size (e.g., keep only the latest 100 entries)
          const MAX_LOG_ENTRIES = 100;
          const updatedLog = [newLogEntry, ...calorieLog].slice(0, MAX_LOG_ENTRIES);
          setCalorieLog(updatedLog);

          // Clear the current image and results/fields after logging
          setImageSrc(null);
          clearEstimation();
          toast({
              title: "記錄成功", // Translated
              description: `${editedFoodItem} (${estimationResult.calorieEstimate} 大卡) 已新增至您的記錄。`, // Translated
          });
      } catch (e) {
           console.error("儲存至 localStorage 時發生錯誤:", e); // Translated
            // Check if the error is the custom LocalStorageError for quota exceeded
            if (e instanceof LocalStorageError && e.message.includes("quota exceeded")) {
                 toast({
                    title: "記錄錯誤", // Translated
                    description: "無法儲存項目。儲存空間可能已滿。", // Translated
                    variant: "destructive",
                 });
                 // Attempt to clear older entries
                 console.warn("LocalStorage 配額已滿。正在嘗試清除較舊的項目..."); // Translated
                 try {
                     const trimmedLog = calorieLog.slice(0, Math.floor(MAX_LOG_ENTRIES * 0.8)); // Keep 80%
                     setCalorieLog([newLogEntry, ...trimmedLog].slice(0, MAX_LOG_ENTRIES));
                      toast({
                          title: "記錄成功 (已清除儲存空間)", // Translated
                          description: `已清除較舊的項目以騰出空間。${editedFoodItem} 已新增。`, // Translated
                          variant: 'default',
                          duration: 6000,
                      });
                      setImageSrc(null);
                      clearEstimation();
                 } catch (finalError) {
                     console.error("即使清除後仍無法儲存:", finalError); // Translated
                     toast({
                         title: "記錄錯誤", // Translated
                         description: "即使清除空間後仍無法儲存項目。請手動清除一些記錄。", // Translated
                         variant: "destructive",
                     });
                 }
            } else {
                // Handle other types of errors
                 toast({
                    title: "記錄錯誤", // Translated
                    description: `無法儲存項目: ${e instanceof Error ? e.message : '未知錯誤'}`, // Provide more details if available - Translated
                    variant: "destructive",
                });
            }
      }

    } else {
         toast({
            title: "記錄錯誤", // Translated
            description: !editedFoodItem ? "食物項目名稱不能為空。" : "沒有可記錄的估計結果。", // Translated
            variant: "destructive",
         });
    }
  };

  const deleteLogEntry = (id: string) => {
    setCalorieLog(calorieLog.filter(entry => entry.id !== id));
     toast({
        title: "記錄項目已刪除", // Translated
        description: "所選項目已從您的記錄中移除。", // Translated
      });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Helper to render meal icon
  const renderMealIcon = (mealType?: MealType) => {
    switch (mealType) {
      case '早餐': return <Coffee className="h-4 w-4 inline-block mr-1 text-muted-foreground" />; // Translated
      case '午餐': return <Sun className="h-4 w-4 inline-block mr-1 text-muted-foreground" />; // Translated
      case '晚餐': return <Moon className="h-4 w-4 inline-block mr-1 text-muted-foreground" />; // Translated
      case '點心': return <Apple className="h-4 w-4 inline-block mr-1 text-muted-foreground" />; // Translated
      default: return null;
    }
  };

  const renderEstimationResult = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-6 space-y-2">
          <LoadingSpinner size={32} />
          <p className="text-muted-foreground">正在估算卡路里...</p> {/* Translated */}
        </div>
      );
    }

    if (error) {
      return (
         <Card className="border-destructive bg-destructive/10">
             <CardHeader>
                 <CardTitle className="text-destructive">估計錯誤</CardTitle> {/* Translated */}
             </CardHeader>
             <CardContent>
                <p className="text-destructive-foreground">{error}</p> {/* Ensure text is readable */}
             </CardContent>
             <CardFooter>
                 <Button variant="destructive" onClick={() => { setError(null); clearEstimation(); setImageSrc(null); }}>關閉</Button> {/* Translated */}
             </CardFooter>
         </Card>
      );
    }

    if (estimationResult) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>記錄詳細資料</CardTitle> {/* Translated */}
             <CardDescription>在記錄前檢閱並編輯詳細資料。</CardDescription> {/* Translated */}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview Image (optional, not stored) */}
            {imageSrc && (
                <div className="relative aspect-video w-full overflow-hidden rounded-md border mb-4">
                  <Image src={imageSrc} alt="食物項目預覽" layout="fill" objectFit="contain" data-ai-hint="food plate"/> {/* Translated */}
                </div>
            )}

            {/* Editable Food Item */}
            <div className="space-y-1">
                <Label htmlFor="foodItem">食物項目</Label> {/* Translated */}
                <Input
                    id="foodItem"
                    value={editedFoodItem}
                    onChange={(e) => setEditedFoodItem(e.target.value)}
                    placeholder="例如：雞肉沙拉" // Translated
                />
            </div>

            {/* Read-only Calorie Estimate & Confidence */}
             <div className="flex justify-between text-sm">
                <p><strong className="font-medium">估計卡路里：</strong> {estimationResult.calorieEstimate} 大卡</p> {/* Translated */}
                <p><strong className="font-medium">信賴度：</strong> {Math.round(estimationResult.confidence * 100)}%</p> {/* Translated */}
            </div>

            {/* Location */}
            <div className="space-y-1">
                <Label htmlFor="location">地點</Label> {/* Translated */}
                 <div className="flex gap-2 items-center">
                    <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="例如：家裡、公司咖啡廳" // Translated
                        disabled={isFetchingLocation}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchCurrentLocation}
                        disabled={isFetchingLocation}
                        title="取得目前位置" // Translated
                        >
                        {isFetchingLocation ? <LoadingSpinner size={16}/> : <LocateFixed className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Meal Type */}
             <div className="space-y-1">
                <Label>餐點類型</Label> {/* Translated */}
                 <RadioGroup value={mealType} onValueChange={(value) => setMealType(value as MealType)} className="flex flex-wrap gap-4 pt-2">
                    {(['早餐', '午餐', '晚餐', '點心'] as MealType[]).map((type) => ( // Translated
                    <div key={type} className="flex items-center space-x-2">
                        <RadioGroupItem value={type} id={`meal-${type}`} />
                        <Label htmlFor={`meal-${type}`} className="font-normal cursor-pointer">
                            {renderMealIcon(type)} {type}
                        </Label>
                    </div>
                    ))}
                </RadioGroup>
            </div>

            {/* Amount/Cost */}
            <div className="space-y-1">
                <Label htmlFor="amount">金額 / 成本 (選填)</Label> {/* Translated */}
                <div className="relative">
                     <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="例如：12.50" // Translated
                        className="pl-8" // Add padding for the icon
                        step="0.01" // Allow decimals
                    />
                </div>
            </div>

          </CardContent>
          <CardFooter className="flex-col sm:flex-row gap-2">
            <Button onClick={logCalories} className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto" disabled={!editedFoodItem || isLoading}>
              {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <PlusCircle className="mr-2 h-4 w-4" />}
               記錄卡路里 {/* Translated */}
            </Button>
             <Button variant="outline" onClick={() => { setImageSrc(null); clearEstimation(); }} className="w-full sm:w-auto">
                取消 {/* Translated */}
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
            <CardTitle>拍攝或上傳食物照片</CardTitle> {/* Translated */}
            <CardDescription>使用您的相機或上傳圖片來估算卡路里。</CardDescription> {/* Translated */}
          </CardHeader>
          <CardContent className="space-y-4">
             {isCameraOpen && (
                <div className="relative">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-md border aspect-video object-cover bg-muted"></video> {/* Added muted and bg-muted */}
                    <Button onClick={takePicture} className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 h-auto shadow-lg z-10" aria-label="拍攝照片"> {/* Translated */}
                        <Camera size={24} />
                    </Button>
                     <Button onClick={closeCamera} variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/50 hover:bg-background/80 rounded-full z-10" aria-label="關閉相機"> {/* Translated */}
                        <X size={18} />
                    </Button>
                </div>
            )}
             {/* Hidden canvas for capturing frame */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

            {!isCameraOpen && imageSrc && !estimationResult && !isLoading && !error && ( // Show preview only when relevant
              <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                <Image src={imageSrc} alt="選取的食物項目" layout="fill" objectFit="contain" data-ai-hint="food plate"/> {/* Translated */}
                 <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/50 hover:bg-background/80 rounded-full" onClick={() => setImageSrc(null)} aria-label="清除圖片"> {/* Translated */}
                    <X size={18} />
                </Button>
              </div>
            )}
             {!isCameraOpen && !imageSrc && !estimationResult && !isLoading && !error && ( // Placeholder
                 <div className="flex items-center justify-center h-40 border-2 border-dashed rounded-md text-muted-foreground bg-muted/50"> {/* Added background */}
                    <p>預覽會顯示在這裡</p> {/* Translated */}
                 </div>
            )}
             {/* Buttons area */}
            {!isCameraOpen && !estimationResult && !isLoading && !error && (
                <div className="flex gap-2 justify-center pt-2">
                    <Button onClick={openCamera} variant="outline" disabled={isLoading}>
                        <Camera className="mr-2 h-4 w-4" /> 開啟相機 {/* Translated */}
                    </Button>
                    <Button onClick={triggerFileInput} variant="outline" disabled={isLoading}>
                        {imageSrc ? "更換照片" : "上傳照片"} {/* Translated */}
                    </Button>
                    <Input
                        type="file"
                        accept="image/*"
                        capture="environment" // Hint for mobile camera
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={isLoading}
                    />
                </div>
            )}
            {/* Show loading/error within this card if no estimation result card is shown */}
             {isLoading && !estimationResult && (
                <div className="flex flex-col items-center justify-center p-6 space-y-2">
                    <LoadingSpinner size={32} />
                    <p className="text-muted-foreground">正在估算卡路里...</p> {/* Translated */}
                </div>
             )}
            {error && !estimationResult && (
                 <div className="mt-4 p-4 border border-destructive bg-destructive/10 rounded-md text-destructive-foreground"> {/* Ensure text is readable */}
                    <p>{error}</p>
                    <Button variant="link" size="sm" className="text-destructive-foreground underline mt-1 p-0 h-auto" onClick={() => { setError(null); clearEstimation(); setImageSrc(null); }}>關閉</Button> {/* Translated */}
                 </div>
             )}
          </CardContent>
        </Card>

       {/* Render Estimation/Log Details Card only when there's a result or specific error state */}
       { (estimationResult || (error && !isLoading)) && renderEstimationResult()}

      </div>

      {/* Right Column: Calorie Log */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>您的卡路里記錄</CardTitle> {/* Translated */}
            <CardDescription>最近記錄的項目。</CardDescription> {/* Translated */}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              {calorieLog.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p>您的卡路里記錄是空的。</p> {/* Translated */}
                    <p>拍張照片開始記錄吧！</p> {/* Translated */}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Map over LogEntryStorage, not LogEntryDisplay */}
                  {calorieLog.map((entry) => (
                    <div key={entry.id}>
                      <div className="flex items-start space-x-4">
                        {/* Placeholder for Image - Since we removed imageUrl from storage */}
                        <div className="w-[80px] h-[80px] flex items-center justify-center rounded-md bg-muted border text-muted-foreground">
                           <ImageOff size={32} aria-label="沒有可用的圖片"/> {/* Translated */}
                        </div>
                        {/* Original Image component commented out */}
                        {/* <Image
                            src={entry.imageUrl} // This property no longer exists on stored entry
                            alt={entry.foodItem}
                            width={80}
                            height={80}
                            className="rounded-md object-cover aspect-square border"
                            data-ai-hint="food item"
                        /> */}
                        <div className="flex-1 space-y-1.5">
                            <p className="font-semibold text-base">{entry.foodItem}</p>
                            <p className="text-sm text-primary">{entry.calorieEstimate} 大卡</p> {/* Translated */}

                             <div className="text-xs text-muted-foreground space-y-0.5">
                                {entry.mealType && (
                                    <div className="flex items-center">
                                        {renderMealIcon(entry.mealType)}
                                        <span>{entry.mealType}</span>
                                    </div>
                                )}
                                {entry.location && (
                                    <div className="flex items-center">
                                        <MapPin className="h-3.5 w-3.5 inline-block mr-1" />
                                        <span>{entry.location}</span>
                                    </div>
                                )}
                                {entry.amount !== undefined && entry.amount !== null && ( // Check for null as well
                                    <div className="flex items-center">
                                        <DollarSign className="h-3.5 w-3.5 inline-block mr-1" />
                                        {/* Ensure amount is treated as number */}
                                        <span>{typeof entry.amount === 'number' ? entry.amount.toFixed(2) : 'N/A'}</span>
                                    </div>
                                )}
                                <p>
                                    記錄時間：{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} {/* Translated */}
                                </p>
                             </div>

                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLogEntry(entry.id)}
                            className="text-destructive hover:bg-destructive/10 mt-1 shrink-0" // Added shrink-0
                            aria-label={`刪除 ${entry.foodItem} 的記錄項目`} // Translated
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Add separator only if it's not the last item */}
                      {calorieLog.indexOf(entry) < calorieLog.length - 1 && (
                         <Separator className="my-4" />
                      )}
                    </div>
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


