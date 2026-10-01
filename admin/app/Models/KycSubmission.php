<?php

// KycSubmission Model: app/Models/KycSubmission.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class KycSubmission extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'document_type', 'document_number', 'front_image', 'back_image', 'selfie_image', 'status'];

    public function user() {
        return $this->belongsTo(User::class);
    }
}