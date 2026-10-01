<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class UtilityController extends Controller
{
    public function generateSha1(Request $request)
    {
        $input = $request->get('input', '');
        $sha1 = sha1($input);
        
        return response()->json([
            'input' => $input,
            'sha1' => $sha1,
            'length' => strlen($sha1)
        ]);
    }
    
    public function sha1Tool()
    {
        return view('admin.utilities.sha1');
    }
}