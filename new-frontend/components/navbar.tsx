'use client';

import Link from 'next/link';
import { MapPin, Compass, Luggage, User, Menu, Plane, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <MapPin className="w-6 h-6" />
            <span className="hidden sm:inline">TravelHub</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/hotels" className="text-sm font-medium text-foreground/80 hover:text-primary transition">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4" />
                Hotels
              </div>
            </Link>
            <Link href="/planner" className="text-sm font-medium text-foreground/80 hover:text-primary transition">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                AI Planner
              </div>
            </Link>
            <Link href="/transport" className="text-sm font-medium text-foreground/80 hover:text-primary transition">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4" />
                Transport
              </div>
            </Link>
            <Link href="/trips" className="text-sm font-medium text-foreground/80 hover:text-primary transition">
              <div className="flex items-center gap-2">
                <Luggage className="w-4 h-4" />
                My Trips
              </div>
            </Link>
            <Link href="/bookings" className="text-sm font-medium text-foreground/80 hover:text-primary transition">
              <div className="flex items-center gap-2">
                <Luggage className="w-4 h-4" />
                Bookings
              </div>
            </Link>
          </div>

          {/* Account & Mobile Menu */}
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/account">Account</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account#settings">Settings</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/hotels">Hotels</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/trips">My Trips</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/bookings">Bookings</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
