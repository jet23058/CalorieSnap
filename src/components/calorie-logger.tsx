
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { estimateCalorieCount, type EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count';
import useLocalStorage from '@/hooks/use-local-storage';
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

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

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
        title: "Geolocation Error",
        description: "Geolocation is not supported by your browser.",
        variant: "destructive",
      });
      return;
    }

    setIsFetchingLocation(true);
    setLocation('Fetching location...'); // Placeholder

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Basic approach: just show coordinates. A real app might use reverse geocoding API.
        // const locString = `Lat: ${position.coords.latitude.toFixed(4)}, Lon: ${position.coords.longitude.toFixed(4)}`;
        const locString = "Current Location"; // Simplified for demo
        setLocation(locString);
        setIsFetchingLocation(false);
        toast({
            title: "Location Fetched",
            description: "Current location set.",
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        let description = "Could not fetch your location.";
        if (error.code === error.PERMISSION_DENIED) {
            description = "Location permission denied. Please enable it in your browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
            description = "Location information is unavailable.";
        } else if (error.code === error.TIMEOUT) {
            description = "The request to get user location timed out.";
        }
        setLocation(''); // Clear placeholder on error
        setIsFetchingLocation(false);
        toast({
          title: "Location Error",
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
      console.error("Error accessing camera:", err);
      setError("Could not access the camera. Please check permissions.");
      toast({
        title: "Camera Error",
        description: "Could not access the camera. Please ensure permissions are granted.",
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
          setError("Could not get canvas context.");
          toast({ title: "Capture Error", description: "Failed to capture image from camera.", variant: "destructive" });
      }
    } else {
        setError("Camera or canvas not ready.");
        toast({ title: "Capture Error", description: "Camera feed is not available.", variant: "destructive" });
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
          console.warn("Image data URI might be very large.");
          // Potentially resize/compress before sending to AI
      }

      const result = await estimateCalorieCount({ photoDataUri });

      if (result.confidence < 0.5) {
         toast({
          title: "Low Confidence Estimation",
          description: "The image might be unclear, or the food item is difficult to identify. The calorie estimate may be less accurate.",
          variant: "default",
          duration: 5000, // Show longer
        });
      }

      setEstimationResult(result);
      setEditedFoodItem(result.foodItem); // Pre-fill editable name
      fetchCurrentLocation(); // Attempt to fetch location after getting result

    } catch (err) {
      console.error("Error estimating calories:", err);
      let errorMsg = "Failed to estimate calories. Please try again.";
      if (err instanceof Error) {
        // Check for specific known error types if possible
         if (err.message.includes("quota") || err.message.includes("size")) {
            errorMsg = "Failed to estimate calories. The image might be too large or there was a network issue.";
         } else {
             errorMsg = `Failed to estimate calories: ${err.message}`;
         }
      }
      setError(errorMsg);
       toast({
        title: "Estimation Failed",
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
              title: "Logged Successfully",
              description: `${editedFoodItem} (${estimationResult.calorieEstimate} kcal) added to your log.`,
          });
      } catch (e) {
           console.error("Error saving to localStorage:", e);
            toast({
                title: "Log Error",
                description: "Could not save the entry. Storage might be full.",
                variant: "destructive",
            });
            // Optionally: Attempt to clear older entries if quota is exceeded
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                 console.warn("LocalStorage quota exceeded. Attempting to clear older entries...");
                 try {
                     const trimmedLog = calorieLog.slice(0, Math.floor(MAX_LOG_ENTRIES * 0.8)); // Keep 80%
                     setCalorieLog([newLogEntry, ...trimmedLog].slice(0, MAX_LOG_ENTRIES));
                      toast({
                          title: "Logged Successfully (Storage Cleared)",
                          description: `Cleared older entries to make space. ${editedFoodItem} added.`,
                          variant: 'default',
                          duration: 6000,
                      });
                      setImageSrc(null);
                      clearEstimation();
                 } catch (finalError) {
                     console.error("Failed to save even after clearing:", finalError);
                     toast({
                         title: "Log Error",
                         description: "Could not save entry even after clearing space. Please manually clear some logs.",
                         variant: "destructive",
                     });
                 }
            }
      }

    } else {
         toast({
            title: "Log Error",
            description: !editedFoodItem ? "Food item name cannot be empty." : "No estimation result to log.",
            variant: "destructive",
         });
    }
  };

  const deleteLogEntry = (id: string) => {
    setCalorieLog(calorieLog.filter(entry => entry.id !== id));
     toast({
        title: "Log Entry Deleted",
        description: "The selected entry has been removed from your log.",
      });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Helper to render meal icon
  const renderMealIcon = (mealType?: MealType) => {
    switch (mealType) {
      case 'Breakfast': return <Coffee className="h-4 w-4 inline-block mr-1 text-muted-foreground" />;
      case 'Lunch': return <Sun className="h-4 w-4 inline-block mr-1 text-muted-foreground" />;
      case 'Dinner': return <Moon className="h-4 w-4 inline-block mr-1 text-muted-foreground" />;
      case 'Snack': return <Apple className="h-4 w-4 inline-block mr-1 text-muted-foreground" />;
      default: return null;
    }
  };

  const renderEstimationResult = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-6 space-y-2">
          <LoadingSpinner size={32} />
          <p className="text-muted-foreground">Estimating calories...</p>
        </div>
      );
    }

    if (error) {
      return (
         <Card className="border-destructive bg-destructive/10">
             <CardHeader>
                 <CardTitle className="text-destructive">Estimation Error</CardTitle>
             </CardHeader>
             <CardContent>
                <p className="text-destructive-foreground">{error}</p> {/* Ensure text is readable */}
             </CardContent>
             <CardFooter>
                 <Button variant="destructive" onClick={() => { setError(null); clearEstimation(); setImageSrc(null); }}>Dismiss</Button>
             </CardFooter>
         </Card>
      );
    }

    if (estimationResult) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Log Details</CardTitle>
             <CardDescription>Review and edit the details before logging.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview Image (optional, not stored) */}
            {imageSrc && (
                <div className="relative aspect-video w-full overflow-hidden rounded-md border mb-4">
                  <Image src={imageSrc} alt="Food item preview" layout="fill" objectFit="contain" data-ai-hint="food plate"/>
                </div>
            )}

            {/* Editable Food Item */}
            <div className="space-y-1">
                <Label htmlFor="foodItem">Food Item</Label>
                <Input
                    id="foodItem"
                    value={editedFoodItem}
                    onChange={(e) => setEditedFoodItem(e.target.value)}
                    placeholder="e.g., Chicken Salad"
                />
            </div>

            {/* Read-only Calorie Estimate & Confidence */}
             <div className="flex justify-between text-sm">
                <p><strong className="font-medium">Estimated Calories:</strong> {estimationResult.calorieEstimate} kcal</p>
                <p><strong className="font-medium">Confidence:</strong> {Math.round(estimationResult.confidence * 100)}%</p>
            </div>

            {/* Location */}
            <div className="space-y-1">
                <Label htmlFor="location">Location</Label>
                 <div className="flex gap-2 items-center">
                    <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g., Home, Office Cafe"
                        disabled={isFetchingLocation}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchCurrentLocation}
                        disabled={isFetchingLocation}
                        title="Fetch Current Location"
                        >
                        {isFetchingLocation ? <LoadingSpinner size={16}/> : <LocateFixed className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Meal Type */}
             <div className="space-y-1">
                <Label>Meal Type</Label>
                 <RadioGroup value={mealType} onValueChange={(value) => setMealType(value as MealType)} className="flex flex-wrap gap-4 pt-2">
                    {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as MealType[]).map((type) => (
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
                <Label htmlFor="amount">Amount / Cost (Optional)</Label>
                <div className="relative">
                     <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="e.g., 12.50"
                        className="pl-8" // Add padding for the icon
                        step="0.01" // Allow decimals
                    />
                </div>
            </div>

          </CardContent>
          <CardFooter className="flex-col sm:flex-row gap-2">
            <Button onClick={logCalories} className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto" disabled={!editedFoodItem || isLoading}>
              {isLoading ? <LoadingSpinner size={16} className="mr-2"/> : <PlusCircle className="mr-2 h-4 w-4" />}
               Log Calories
            </Button>
             <Button variant="outline" onClick={() => { setImageSrc(null); clearEstimation(); }} className="w-full sm:w-auto">
                Cancel
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
            <CardTitle>Capture or Upload Food Photo</CardTitle>
            <CardDescription>Use your camera or upload an image to estimate calories.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {isCameraOpen && (
                <div className="relative">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-md border aspect-video object-cover bg-muted"></video> {/* Added muted and bg-muted */}
                    <Button onClick={takePicture} className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 h-auto shadow-lg z-10" aria-label="Take Picture">
                        <Camera size={24} />
                    </Button>
                     <Button onClick={closeCamera} variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/50 hover:bg-background/80 rounded-full z-10" aria-label="Close Camera">
                        <X size={18} />
                    </Button>
                </div>
            )}
             {/* Hidden canvas for capturing frame */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

            {!isCameraOpen && imageSrc && !estimationResult && !isLoading && !error && ( // Show preview only when relevant
              <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                <Image src={imageSrc} alt="Selected food item" layout="fill" objectFit="contain" data-ai-hint="food plate"/>
                 <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/50 hover:bg-background/80 rounded-full" onClick={() => setImageSrc(null)} aria-label="Clear Image">
                    <X size={18} />
                </Button>
              </div>
            )}
             {!isCameraOpen && !imageSrc && !estimationResult && !isLoading && !error && ( // Placeholder
                 <div className="flex items-center justify-center h-40 border-2 border-dashed rounded-md text-muted-foreground bg-muted/50"> {/* Added background */}
                    <p>Preview appears here</p>
                 </div>
            )}
             {/* Buttons area */}
            {!isCameraOpen && !estimationResult && !isLoading && !error && (
                <div className="flex gap-2 justify-center pt-2">
                    <Button onClick={openCamera} variant="outline" disabled={isLoading}>
                        <Camera className="mr-2 h-4 w-4" /> Open Camera
                    </Button>
                    <Button onClick={triggerFileInput} variant="outline" disabled={isLoading}>
                        {imageSrc ? "Change Photo" : "Upload Photo"}
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
                    <p className="text-muted-foreground">Estimating calories...</p>
                </div>
             )}
            {error && !estimationResult && (
                 <div className="mt-4 p-4 border border-destructive bg-destructive/10 rounded-md text-destructive-foreground"> {/* Ensure text is readable */}
                    <p>{error}</p>
                    <Button variant="link" size="sm" className="text-destructive-foreground underline mt-1 p-0 h-auto" onClick={() => { setError(null); clearEstimation(); setImageSrc(null); }}>Dismiss</Button> {/* Use link for dismiss */}
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
            <CardTitle>Your Calorie Log</CardTitle>
            <CardDescription>Recently logged items.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              {calorieLog.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p>Your calorie log is empty.</p>
                    <p>Snap a photo to get started!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Map over LogEntryStorage, not LogEntryDisplay */}
                  {calorieLog.map((entry) => (
                    <div key={entry.id}>
                      <div className="flex items-start space-x-4">
                        {/* Placeholder for Image - Since we removed imageUrl from storage */}
                        <div className="w-[80px] h-[80px] flex items-center justify-center rounded-md bg-muted border text-muted-foreground">
                           <ImageOff size={32} aria-label="No image available"/>
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
                            <p className="text-sm text-primary">{entry.calorieEstimate} kcal</p>

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
                                    Logged: {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </p>
                             </div>

                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLogEntry(entry.id)}
                            className="text-destructive hover:bg-destructive/10 mt-1 shrink-0" // Added shrink-0
                            aria-label={`Delete log entry for ${entry.foodItem}`}
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

    