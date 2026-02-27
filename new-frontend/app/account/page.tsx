'use client';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Mail, Phone, MapPin, Heart, Bell, Lock, LogOut } from 'lucide-react';
import { useState } from 'react';

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security' | 'saved'>('profile');
  const [profile, setProfile] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1 (555) 000-0000',
    country: 'United States',
    city: 'New York',
  });

  const [preferences, setPreferences] = useState({
    newsletter: true,
    bookingAlerts: true,
    priceDropAlerts: true,
    reviews: true,
  });

  type ProfileField = keyof typeof profile;
  type PreferenceField = keyof typeof preferences;

  const handleProfileChange = (field: ProfileField, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handlePreferenceChange = (field: PreferenceField) => {
    setPreferences((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        {/* Header */}
        <section className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-4xl font-bold text-foreground">Account Settings</h1>
            <p className="text-foreground/70 mt-2">Manage your profile and preferences</p>
          </div>
        </section>

        {/* Content */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Tabs */}
            <div className="lg:col-span-1">
              <nav className="space-y-2">
                {[
                  { id: 'profile' as const, label: 'Profile', icon: User },
                  { id: 'preferences' as const, label: 'Preferences', icon: Bell },
                  { id: 'saved' as const, label: 'Saved Hotels', icon: Heart },
                  { id: 'security' as const, label: 'Security', icon: Lock },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`w-full text-left px-4 py-3 rounded-lg font-medium transition flex items-center gap-2 ${
                      activeTab === id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/70 hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <Card className="p-8">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Personal Information</h2>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">First Name</label>
                        <Input
                          value={profile.firstName}
                          onChange={(e) => handleProfileChange('firstName', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Last Name</label>
                        <Input
                          value={profile.lastName}
                          onChange={(e) => handleProfileChange('lastName', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Email Address</label>
                        <Input value={profile.email} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Phone Number</label>
                        <Input
                          value={profile.phone}
                          onChange={(e) => handleProfileChange('phone', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Country</label>
                        <Input
                          value={profile.country}
                          onChange={(e) => handleProfileChange('country', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">City</label>
                        <Input
                          value={profile.city}
                          onChange={(e) => handleProfileChange('city', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button>Save Changes</Button>
                      <Button variant="outline">Cancel</Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <Card className="p-8">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Notification Preferences</h2>
                  <div className="space-y-4">
                    {[
                      {
                        id: 'newsletter' as const,
                        label: 'Travel Newsletter',
                        description: 'Get weekly travel tips and destination guides',
                      },
                      {
                        id: 'bookingAlerts' as const,
                        label: 'Booking Alerts',
                        description: 'Receive confirmations and updates for your bookings',
                      },
                      {
                        id: 'priceDropAlerts' as const,
                        label: 'Price Drop Alerts',
                        description: 'Get notified when prices drop on your tracked hotels',
                      },
                      {
                        id: 'reviews' as const,
                        label: 'Review Requests',
                        description: 'Help us improve by sharing your travel experience',
                      },
                    ].map(({ id, label, description }) => (
                      <label
                        key={id}
                        className="flex items-center p-4 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition"
                      >
                        <input
                          type="checkbox"
                          checked={preferences[id]}
                          onChange={() => handlePreferenceChange(id)}
                          className="w-4 h-4 rounded"
                        />
                        <div className="ml-4 flex-1">
                          <p className="font-medium text-foreground">{label}</p>
                          <p className="text-sm text-foreground/60">{description}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button>Save Preferences</Button>
                    <Button variant="outline">Cancel</Button>
                  </div>
                </Card>
              )}

              {/* Saved Hotels Tab */}
              {activeTab === 'saved' && (
                <Card className="p-8">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Saved Hotels</h2>
                  <div className="space-y-3">
                    {[
                      {
                        name: 'Luxury Palace Hotel',
                        location: 'Downtown District',
                        price: '$250/night',
                      },
                      {
                        name: 'Beachfront Resort',
                        location: 'Coastal Area',
                        price: '$380/night',
                      },
                      {
                        name: 'City Center Boutique',
                        location: 'Heart of City',
                        price: '$180/night',
                      },
                    ].map((hotel, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition"
                      >
                        <div className="flex-1">
                          <p className="font-bold text-foreground">{hotel.name}</p>
                          <p className="text-sm text-foreground/60 flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {hotel.location}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{hotel.price}</p>
                          <Button size="sm" variant="ghost">
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <Card className="p-8">
                    <h2 className="text-2xl font-bold text-foreground mb-6">Password</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">
                          Current Password
                        </label>
                        <Input type="password" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">
                          New Password
                        </label>
                        <Input type="password" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">
                          Confirm Password
                        </label>
                        <Input type="password" />
                      </div>
                      <Button>Update Password</Button>
                    </div>
                  </Card>

                  <Card className="p-8 border-red-200">
                    <h2 className="text-2xl font-bold text-foreground mb-4">Danger Zone</h2>
                    <p className="text-foreground/70 mb-4">
                      Deleting your account is permanent and cannot be undone.
                    </p>
                    <Button variant="destructive">Delete Account</Button>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Logout */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Button variant="outline" className="gap-2 text-red-600 hover:text-red-700">
            <LogOut className="w-5 h-5" />
            Sign Out
          </Button>
        </section>
      </main>
      <Footer />
    </>
  );
}
