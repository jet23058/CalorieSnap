"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { estimateCalorieCount, type EstimateCalorieCountOutput } from '@/ai/flows/estimate-calorie-count';
import useLocalStorage from '@/hooks/use-local-storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/loading-spinner';
import { Camera, Trash2, PlusCircle, UtensilsCrossed } from 'lucide-react';

interface LogEntry extends EstimateCalorieCountOutput {
  id: string;
  timestamp: number;
  imageUrl: string; // Store the image URL for display in the log
}

export default function CalorieLogger() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [estimationResult, setEstimationResult] = useState<EstimateCalorieCountOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calorieLog, setCalorieLog] = useLocalStorage<LogEntry[]>('calorieLog', []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  // Cleanup camera stream on unmount or when camera is closed
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImageSrc(result);
        setEstimationResult(null); // Clear previous result
        setError(null); // Clear previous error
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
    setEstimationResult(null);
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
      // Set canvas dimensions based on video intrinsic dimensions for correct aspect ratio
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Get the image data URL from the canvas
        const dataUri = canvas.toDataURL('image/jpeg'); // Use jpeg for smaller size
        setImageSrc(dataUri);
        setEstimationResult(null);
        setError(null);
        closeCamera(); // Close camera after taking picture
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


  const estimateCalories = useCallback(async (photoDataUri: string) => {
    setIsLoading(true);
    setError(null);
    setEstimationResult(null);

    try {
      const result = await estimateCalorieCount({ photoDataUri });

      // Simple check for potentially unclear images based on confidence
      if (result.confidence < 0.5) { // Threshold can be adjusted
         toast({
          title: "Low Confidence Estimation",
          description: "The image might be unclear, or the food item is difficult to identify. The calorie estimate may be less accurate. Consider taking another picture.",
          variant: "default", // Use default or a custom "warning" variant if available
        });
      }

      setEstimationResult(result);

    } catch (err) {
      console.error("Error estimating calories:", err);
      setError("Failed to estimate calories. The AI model might be unavailable or encountered an error. Please try again.");
       toast({
        title: "Estimation Failed",
        description: "Could not estimate calories. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Add toast dependency

  const logCalories = () => {
    if (estimationResult && imageSrc) {
      const newLogEntry: LogEntry = {
        ...estimationResult,
        id: Date.now().toString(), // Simple unique ID
        timestamp: Date.now(),
        imageUrl: imageSrc, // Store the captured/uploaded image Data URI
      };
      setCalorieLog([newLogEntry, ...calorieLog]); // Add to the beginning of the log
      // Clear the current image and result after logging
      setImageSrc(null);
      setEstimationResult(null);
       toast({
        title: "Logged Successfully",
        description: `${estimationResult.foodItem} (${estimationResult.calorieEstimate} kcal) added to your log.`,
      });
    } else {
         toast({
            title: "Log Error",
            description: "No estimation result to log.",
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
                <p className="text-destructive">{error}</p>
             </CardContent>
             <CardFooter>
                 <Button variant="destructive" onClick={() => setError(null)}>Dismiss</Button>
             </CardFooter>
         </Card>
      );
    }

    if (estimationResult) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Estimation Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><strong className="font-medium">Food Item:</strong> {estimationResult.foodItem}</p>
            <p><strong className="font-medium">Estimated Calories:</strong> {estimationResult.calorieEstimate} kcal</p>
            <p><strong className="font-medium">Confidence:</strong> {Math.round(estimationResult.confidence * 100)}%</p>
          </CardContent>
          <CardFooter>
            <Button onClick={logCalories} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <PlusCircle className="mr-2 h-4 w-4" /> Log Calories
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
                    <video ref={videoRef} autoPlay playsInline className="w-full rounded-md border"></video>
                    <Button onClick={takePicture} className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-accent text-accent-foreground hover:bg-accent/90 rounded-full p-3 h-auto shadow-lg">
                        <Camera size={24} />
                    </Button>
                     <Button onClick={closeCamera} variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/50 hover:bg-background/80 rounded-full">
                        <X size={18} />
                    </Button>
                </div>
            )}
             {/* Hidden canvas for capturing frame */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

            {!isCameraOpen && imageSrc && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                <Image src={imageSrc} alt="Selected food item" layout="fill" objectFit="contain" data-ai-hint="food plate"/>
              </div>
            )}
             {!isCameraOpen && !imageSrc && (
                 <div className="flex items-center justify-center h-40 border-2 border-dashed rounded-md text-muted-foreground">
                    <p>Preview appears here</p>
                 </div>
            )}
            <div className="flex gap-2 justify-center">
             {!isCameraOpen && (
                <Button onClick={openCamera} variant="outline">
                    <Camera className="mr-2 h-4 w-4" /> Open Camera
                </Button>
             )}
              <Button onClick={triggerFileInput} variant="outline" disabled={isCameraOpen || isLoading}>
                {imageSrc ? "Change Photo" : "Upload Photo"}
              </Button>
              <Input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
                disabled={isCameraOpen || isLoading}
              />
            </div>
          </CardContent>
        </Card>

       {renderEstimationResult()}

      </div>

      {/* Right Column: Calorie Log */}
      <div className="md:w-1/2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Calorie Log</CardTitle>
            <CardDescription>Recently logged items.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4"> {/* Adjust height as needed */}
              {calorieLog.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                    <UtensilsCrossed className="w-12 h-12 mb-4 opacity-50" />
                    <p>Your calorie log is empty.</p>
                    <p>Snap a photo to get started!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {calorieLog.map((entry) => (
                    <div key={entry.id}>
                      <div className="flex items-start space-x-4">
                        <Image
                            src={entry.imageUrl}
                            alt={entry.foodItem}
                            width={64}
                            height={64}
                            className="rounded-md object-cover aspect-square border"
                            data-ai-hint="food item"
                        />
                        <div className="flex-1 space-y-1">
                            <p className="font-medium">{entry.foodItem}</p>
                            <p className="text-sm text-muted-foreground">{entry.calorieEstimate} kcal</p>
                            <p className="text-xs text-muted-foreground">
                                Logged: {new Date(entry.timestamp).toLocaleTimeString()} - {new Date(entry.timestamp).toLocaleDateString()}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLogEntry(entry.id)}
                            className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete entry</span>
                        </Button>
                      </div>
                      <Separator className="my-4" />
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
