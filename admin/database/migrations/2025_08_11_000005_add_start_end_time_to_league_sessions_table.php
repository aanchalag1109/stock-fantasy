<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('league_sessions', function (Blueprint $table) {
            $table->dateTime('start_time')->nullable()->after('max_stocks');
            $table->dateTime('end_time')->nullable()->after('start_time');
        });
    }

    public function down(): void
    {
        Schema::table('league_sessions', function (Blueprint $table) {
            $table->dropColumn(['start_time', 'end_time']);
        });
    }
};
