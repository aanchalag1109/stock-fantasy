<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WithdrawalRequest extends Model
{
    protected $fillable = [
        'user_id', 'amount', 'status', 'message', 'admin_message', 'usdt_wallet_address', 'usdt_network'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
