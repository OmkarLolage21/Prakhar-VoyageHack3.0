'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

export interface BookingFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests: string;
  promoCode: string;
  acceptTerms: boolean;
}

interface BookingFormProps {
  hotelName: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  totalPrice: number;
  onSubmit?: (data: BookingFormData) => void;
}

export function BookingForm({
  hotelName,
  roomType,
  checkInDate,
  checkOutDate,
  numberOfGuests,
  totalPrice,
  onSubmit,
}: BookingFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<BookingFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialRequests: '',
    promoCode: '',
    acceptTerms: false,
  });

  const [discount, setDiscount] = useState(0);
  const finalPrice = totalPrice - discount;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleApplyPromo = () => {
    // Mock promo codes
    const promoCodes: { [key: string]: number } = {
      WELCOME10: 0.1,
      SAVE20: 0.2,
      STAY3NIGHTS: 50,
    };

    const code = formData.promoCode.toUpperCase();
    if (promoCodes[code]) {
      const discountAmount =
        typeof promoCodes[code] === 'number' && promoCodes[code] < 1
          ? totalPrice * promoCodes[code]
          : promoCodes[code];
      setDiscount(discountAmount);
    } else {
      alert('Invalid promo code');
      setDiscount(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.acceptTerms) {
      alert('Please accept the terms and conditions');
      return;
    }
    onSubmit?.(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Booking Summary */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <h3 className="font-bold text-lg text-foreground mb-4">Booking Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground/70">Hotel:</span>
            <span className="font-medium">{hotelName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/70">Room:</span>
            <span className="font-medium">{roomType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/70">Check-in:</span>
            <span className="font-medium">{checkInDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/70">Check-out:</span>
            <span className="font-medium">{checkOutDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/70">Guests:</span>
            <span className="font-medium">{numberOfGuests}</span>
          </div>
        </div>
      </Card>

      {/* Guest Information */}
      <Card className="p-6">
        <h3 className="font-bold text-lg text-foreground mb-4">Guest Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">First Name *</label>
            <Input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
              placeholder="John"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Last Name *</label>
            <Input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
              placeholder="Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Email Address *</label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Phone Number *</label>
            <Input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              placeholder="+1 (555) 000-0000"
            />
          </div>
        </div>
      </Card>

      {/* Special Requests */}
      <Card className="p-6">
        <h3 className="font-bold text-lg text-foreground mb-4">Special Requests</h3>
        <textarea
          name="specialRequests"
          value={formData.specialRequests}
          onChange={handleChange}
          placeholder="e.g., High floor, early check-in needed, anniversary celebration..."
          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          rows={4}
        />
        <p className="text-xs text-foreground/60 mt-2">
          Special requests are subject to availability and cannot be guaranteed.
        </p>
      </Card>

      {/* Promo Code */}
      <Card className="p-6">
        <h3 className="font-bold text-lg text-foreground mb-4">Have a Promo Code?</h3>
        <div className="flex gap-2">
          <Input
            type="text"
            name="promoCode"
            value={formData.promoCode}
            onChange={handleChange}
            placeholder="Enter promo code"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={handleApplyPromo}>
            Apply
          </Button>
        </div>
        <p className="text-xs text-foreground/60 mt-2">
          Try: WELCOME10, SAVE20, or STAY3NIGHTS for demo codes
        </p>
      </Card>

      {/* Price Breakdown */}
      <Card className="p-6">
        <h3 className="font-bold text-lg text-foreground mb-4">Price Breakdown</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-foreground/70">
            <span>Room Total:</span>
            <span>${totalPrice.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600 font-semibold">
              <span>Discount:</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-bold text-foreground">Final Total:</span>
            <span className="text-2xl font-bold text-primary">${finalPrice.toFixed(2)}</span>
          </div>
        </div>
      </Card>

      {/* Terms */}
      <Card className="p-6 border-orange-200 bg-orange-50/30">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={formData.acceptTerms}
                onChange={handleChange}
                className="mt-1"
              />
              <span className="text-sm text-foreground/70">
                I agree to the{' '}
                <a href="#" className="text-primary hover:underline">
                  terms and conditions
                </a>
                ,{' '}
                <a href="#" className="text-primary hover:underline">
                  cancellation policy
                </a>
                , and{' '}
                <a href="#" className="text-primary hover:underline">
                  privacy policy
                </a>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        onClick={() => {
          if (formData.acceptTerms && formData.firstName && formData.email) {
            router.push('/payment');
          }
        }}
      >
        Confirm & Pay ${finalPrice.toFixed(2)}
      </Button>

      <p className="text-xs text-center text-foreground/60">
        Your payment information is secure and encrypted
      </p>
    </form>
  );
}
