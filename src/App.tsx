// src/App.tsx (for storybook repo)
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner"; // Assuming you keep sonner
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar"; // Adapt/replace later if needed
import Footer from "./components/layout/Footer"; // Adapt/replace later if needed
import Home from "./pages/Home"; // Adapt this into Storybook Home
import Dashboard from "./pages/Dashboard"; // Adapt this into Storybook Dashboard/Library
// *** RENAME/REPLACE LATER: import StoryCreator from "./pages/StoryCreator";
import StorybookCreator from "./pages/StorybookCreator"; // Create this new file based on StoryCreator
import StorybookLibrary from "./pages/StorybookLibrary"; // Create this page
import StorybookPreview from "./pages/StorybookPreview"; // Create this page
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage"; // Keep, uses shared Auth
import SignupPage from "./pages/SignupPage"; // Keep, uses shared Auth
import ProtectedRoute from "@/components/ProtectedRoute"; // Keep, uses shared Auth
import { AuthProvider } from './context/AuthContext'; // Keep, uses shared Auth

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider> {/* AuthProvider wraps everything */}
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              <Routes>
                {/* --- Public Storybook Routes --- */}
                <Route path="/" element={<Home />} /> {/* Adapt this later */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                {/* Maybe a public preview link later? For now, keep preview protected */}

                {/* --- Protected Storybook Routes --- */}
                <Route element={<ProtectedRoute />}>
                  {/* Rename/Adapt Dashboard or create new Library */}
                  <Route path="/dashboard" element={<StorybookLibrary />} />
                  <Route path="/storybooks" element={<StorybookLibrary />} />
                  {/* Use the adapted/new creator component */}
                  <Route path="/create-storybook" element={<StorybookCreator />} />
                  {/* Add the new preview page route */}
                  <Route path="/storybook/:storybookId" element={<StorybookPreview />} />
                  {/* Add other protected routes specific to storybook here */}
                </Route>

                {/* Not Found Route (Keep last) */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;