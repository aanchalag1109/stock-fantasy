<?php

// app/Http/Controllers/KycSubmissionController.php
namespace App\Http\Controllers;

use App\Models\KycSubmission;
use Illuminate\Http\Request;

class KycSubmissionController extends Controller
{
    public function index() {
        $kycs = KycSubmission::with('user')->get();
        return view('kyc.index', compact('kycs'));
    }
}