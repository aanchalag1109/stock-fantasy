<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
    // All column additions commented out to prevent duplicate column errors. Use safe migration for new columns.
    }

    public function down(): void
    {
        Schema::table('contests', function (Blueprint $table) {
            $table->dropForeign(['league_session_id']);
            $table->dropColumn([
                'league_session_id', 'category', 'multiple_entries', 'max_entries', 'max_entries_per_user', 'winner_percent', 'platform_commission_percent'
            ]);
        });
    }
};
