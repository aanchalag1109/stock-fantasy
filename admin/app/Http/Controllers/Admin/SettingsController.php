<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SettingsController extends Controller
{
    /**
     * Show the admin settings page.
     *
     * @return \Illuminate\View\View
     */
    public function index()
    {
        $admin = Auth::guard('admin')->user();
        $settings = \DB::table('settings')->pluck('value', 'key');
        return view('admin.settings.index', [
            'admin' => $admin,
            'settings' => $settings
        ]);
    }

    /**
     * Update the admin's password.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\RedirectResponse
     */
    public function updatePassword(Request $request)
    {
        $request->validate([
            'current_password' => ['required', 'current_password:admin'],
            'password' => ['required', 'confirmed', 'min:8'],
        ]);

        $admin = Auth::guard('admin')->user();
        $admin->update([
            'password' => bcrypt($request->password)
        ]);

        return back()->with('success', 'Password updated successfully.');
    }
    /**
     * Update Payment API Key
     */
    public function updatePayment(Request $request)
    {
        $request->validate([
            'payment_api' => 'required|string',
        ]);
        // Save to config or database as needed
        \DB::table('settings')->updateOrInsert(
            ['key' => 'payment_api'],
            ['value' => $request->input('payment_api')]
        );
        return back()->with('success', 'Payment API Key updated successfully.');
    }

    /**
     * Update Terms & Conditions
     */
    public function updateTerms(Request $request)
    {
        $request->validate([
            'terms' => 'required|string',
        ]);
        \DB::table('settings')->updateOrInsert(
            ['key' => 'terms'],
            ['value' => $request->input('terms')]
        );
        return back()->with('success', 'Terms & Conditions updated successfully.');
    }

    /**
     * Update Privacy Policy
     */
    public function updatePrivacy(Request $request)
    {
        $request->validate([
            'privacy' => 'required|string',
        ]);
        \DB::table('settings')->updateOrInsert(
            ['key' => 'privacy'],
            ['value' => $request->input('privacy')]
        );
        return back()->with('success', 'Privacy Policy updated successfully.');
    }

    /**
     * Update About
     */
    public function updateAbout(Request $request)
    {
        $request->validate([
            'about' => 'required|string',
        ]);
        \DB::table('settings')->updateOrInsert(
            ['key' => 'about'],
            ['value' => $request->input('about')]
        );
        return back()->with('success', 'About updated successfully.');
    }

    /**
     * Update Payment Policy
     */
    public function updatePaymentPolicy(Request $request)
    {
        $request->validate([
            'payment_policy' => 'required|string',
        ]);
        \DB::table('settings')->updateOrInsert(
            ['key' => 'payment_policy'],
            ['value' => $request->input('payment_policy')]
        );
        return back()->with('success', 'Payment Policy updated successfully.');
    }
}
