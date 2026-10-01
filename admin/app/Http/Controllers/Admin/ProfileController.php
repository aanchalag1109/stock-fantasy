<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProfileController extends Controller
{
    /**
     * Show the admin's profile page.
     *
     * @return \Illuminate\View\View
     */
    public function show()
    {
        $admin = Auth::guard('admin')->user();
        
        return view('admin.profile.show', [
            'admin' => $admin
        ]);
    }

    /**
     * Update the admin's profile information.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\RedirectResponse
     */
    public function update(Request $request)
    {
        $admin = Auth::guard('admin')->user();
        
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:admins,email,' . $admin->id,
        ]);
        
        $admin->update($validated);
        
        return redirect()->route('admin.profile')
            ->with('success', 'Profile updated successfully.');
    }
}
