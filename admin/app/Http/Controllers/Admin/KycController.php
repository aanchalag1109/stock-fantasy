<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;

use App\Models\KycSubmission;
use Illuminate\Http\Request;

class KycController extends Controller
{
    public function index() {
        $submissions = KycSubmission::with('user')->get();
        return view('admin.kyc.index', compact('submissions'));
    }

    public function show($id) {
        $submission = KycSubmission::with('user')->findOrFail($id);
        return view('admin.kyc.show', compact('submission'));
    }

    public function approve($id) {
        $kyc = KycSubmission::findOrFail($id);
        $kyc->status = 'approved';
        $kyc->save();
        return back()->with('success', 'KYC approved!');
    }
    public function reject($id) {
        $kyc = KycSubmission::findOrFail($id);
        $kyc->status = 'rejected';
        $kyc->save();
        return back()->with('success', 'KYC rejected!');
    }
}