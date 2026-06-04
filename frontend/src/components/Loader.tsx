import { Loader2 } from "lucide-react";

interface LoaderProps {
  className?: string;
}

export default function Loader({ className = "h-4 w-4 text-primary" }: LoaderProps) {
  return <Loader2 className={`animate-spin ${className}`} />;
}
