import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <a href="/Guia_Power_Automate_sin_instalaciones.html" download className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#3e8b23] px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#32721c]">Descargar guía PAD</a>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
