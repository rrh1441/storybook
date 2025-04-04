import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { BookOpen, Menu, X } from "lucide-react";
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    setIsMenuOpen(false);
  }, []);

  const handleLogout = async () => {
    try {
      setIsMenuOpen(false);
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <nav className="py-4 px-6 md:px-8 bg-white shadow-sm sticky top-0 z-40">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-2">
          <BookOpen className="h-8 w-8 text-[#8A4FFF]" />
          <span className="text-2xl font-display font-bold text-[#4FB8FF]">
            StoryTime
          </span>
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          <a
            href="/#how-it-works"
            className="font-medium text-gray-600 hover:text-[#8A4FFF] transition-colors"
          >
            How It Works
          </a>

          {loading ? (
            <div className="flex items-center space-x-3">
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
          ) : user ? (
            <>
              <Link
                to="/dashboard"
                className="font-medium text-gray-600 hover:text-[#8A4FFF] transition-colors"
              >
                Dashboard
              </Link>
              <Button
                variant="outline"
                className="font-medium border-[#FF9F51] text-[#FF9F51] hover:bg-[#FF9F51]/10 rounded-full h-9 px-4"
                onClick={handleLogout}
              >
                Log Out
              </Button>
            </>
          ) : (
            <div className="flex items-center space-x-3">
              <Link to="/login">
                <Button
                  variant="outline"
                  className="font-medium border-gray-300 hover:border-[#8A4FFF] hover:text-[#8A4FFF] rounded-full h-9 px-4"
                >
                  Log in
                </Button>
              </Link>
              <Link to="/signup">
                <Button
                  className="bg-[#4FB8FF] hover:bg-[#4FB8FF]/90 text-white font-medium rounded-full shadow-sm h-9 px-4"
                >
                  Sign Up Free
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-1"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? (
            <X className="h-6 w-6 text-gray-700" />
          ) : (
            <Menu className="h-6 w-6 text-gray-700" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-[69px] z-30 bg-white md:hidden pointer-events-none">
          {/* Only this inner div can be clicked; the outer overlay won't block anything else. */}
          <div className="flex flex-col p-8 space-y-6 pointer-events-auto">
            <a
              href="/#how-it-works"
              className="text-xl font-medium text-gray-700 hover:text-[#8A4FFF]"
              onClick={() => setIsMenuOpen(false)}
            >
              How It Works
            </a>

            {loading ? (
              <div className="pt-4 space-y-4">
                <Skeleton className="h-10 w-full rounded-full" />
                <Skeleton className="h-10 w-full rounded-full" />
              </div>
            ) : user ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-xl font-medium text-gray-700 hover:text-[#8A4FFF]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Button
                  variant="outline"
                  className="w-full font-medium border-[#FF9F51] text-[#FF9F51] hover:bg-[#FF9F51]/10 rounded-full"
                  onClick={handleLogout}
                >
                  Log Out
                </Button>
              </>
            ) : (
              <div className="pt-4 space-y-4">
                <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full font-medium rounded-full" variant="outline">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full bg-[#4FB8FF] hover:bg-[#4FB8FF]/90 text-white font-medium rounded-full">
                    Sign Up Free
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
