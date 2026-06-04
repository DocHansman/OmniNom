import React, { useState, useRef } from "react";
import { Camera, Image as ImageIcon, Trash2, Upload } from "lucide-react";

interface PhotoCaptureProps {
  photoPath: string | null;
  onPhotoSelected: (file: File | null) => void;
  onPhotoCleared: () => void;
}

export default function PhotoCapture({ photoPath, onPhotoSelected, onPhotoCleared }: PhotoCaptureProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Compress image client-side via Canvas API
  const processImageFile = async (file: File) => {
    setSelectedFileName(file.name);
    setIsCompressing(true);
    try {
      const compressedBlob = await compressImage(file);
      const compressedFile = new File([compressedBlob], file.name, {
        type: file.type,
        lastModified: Date.now()
      });
      
      // Update local preview
      const localUrl = URL.createObjectURL(compressedFile);
      setPreviewUrl(localUrl);
      
      // Bubble up compressed file
      onPhotoSelected(compressedFile);
    } catch (e) {
      console.error("Image compression error:", e);
      // Fallback: send original file if canvas compression fails
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);
      onPhotoSelected(file);
    } finally {
      setIsCompressing(false);
    }
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const maxDimension = 1280;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Canvas toBlob failed"));
            },
            "image/jpeg",
            0.85 // 85% quality
          );
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const handleClear = () => {
    setPreviewUrl(null);
    setSelectedFileName(null);
    onPhotoCleared();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const displayImage = previewUrl || (photoPath ? photoPath : null);

  return (
    <div className="space-y-3">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Frame Container */}
      <div className="relative flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-muted/30 overflow-hidden shadow-inner group">
        {displayImage ? (
          <>
            <img
              src={displayImage}
              alt="Rezept Vorschau"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
            />
            {selectedFileName && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white truncate text-center z-10">
                📄 {selectedFileName}
              </div>
            )}
            {/* Delete button overlay */}
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95 z-20"
            >
              <Trash2 size={16} />
            </button>
          </>
        ) : (
          <div className="text-center p-4 flex flex-col items-center gap-2">
            <div className="p-3 rounded-full bg-border/40 text-on-surface-muted">
              <Camera size={24} />
            </div>
            <p className="text-xs font-semibold text-on-surface-muted">Kein Foto ausgewählt</p>
          </div>
        )}

        {isCompressing && (
          <div className="absolute inset-0 bg-surface/75 flex flex-col items-center justify-center gap-2 z-10">
            <Upload className="h-6 w-6 animate-bounce text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Foto wird komprimiert...</span>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold hover:bg-muted active:scale-98 transition-all cursor-pointer"
        >
          <Camera size={14} className="text-on-surface-muted" />
          <span>Kamera</span>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold hover:bg-muted active:scale-98 transition-all cursor-pointer"
        >
          <ImageIcon size={14} className="text-on-surface-muted" />
          <span>Galerie</span>
        </button>
      </div>
    </div>
  );
}
