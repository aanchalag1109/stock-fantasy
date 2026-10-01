<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('contests', function (Blueprint $table) {
            if (!Schema::hasColumn('contests', 'category')) {
                $table->string('category')->nullable()->after('type');
            }
            if (!Schema::hasColumn('contests', 'multiple_entries')) {
                $table->boolean('multiple_entries')->default(false)->after('entry_fee');
            }
            if (!Schema::hasColumn('contests', 'max_entries')) {
                $table->integer('max_entries')->nullable()->after('multiple_entries');
            }
            if (!Schema::hasColumn('contests', 'max_entries_per_user')) {
                $table->integer('max_entries_per_user')->nullable()->after('max_entries');
            }
            if (!Schema::hasColumn('contests', 'winner_percent')) {
                $table->float('winner_percent')->nullable()->after('max_entries_per_user');
            }
            if (!Schema::hasColumn('contests', 'platform_commission_percent')) {
                $table->float('platform_commission_percent')->nullable()->after('winner_percent');
            }
            if (!Schema::hasColumn('contests', 'league_session_id')) {
                $table->unsignedBigInteger('league_session_id')->nullable()->after('id');
                $table->foreign('league_session_id')->references('id')->on('league_sessions')->onDelete('set null');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contests', function (Blueprint $table) {
            if (Schema::hasColumn('contests', 'category')) {
                $table->dropColumn('category');
            }
            if (Schema::hasColumn('contests', 'multiple_entries')) {
                $table->dropColumn('multiple_entries');
            }
            if (Schema::hasColumn('contests', 'max_entries')) {
                $table->dropColumn('max_entries');
            }
            if (Schema::hasColumn('contests', 'max_entries_per_user')) {
                $table->dropColumn('max_entries_per_user');
            }
            if (Schema::hasColumn('contests', 'winner_percent')) {
                $table->dropColumn('winner_percent');
            }
            if (Schema::hasColumn('contests', 'platform_commission_percent')) {
                $table->dropColumn('platform_commission_percent');
            }
            if (Schema::hasColumn('contests', 'league_session_id')) {
                $table->dropForeign(['league_session_id']);
                $table->dropColumn('league_session_id');
            }
        });
    }
};
