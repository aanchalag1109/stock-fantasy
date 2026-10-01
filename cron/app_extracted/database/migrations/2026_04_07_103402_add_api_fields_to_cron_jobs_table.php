<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cron_jobs', function (Blueprint $table) {
            $table->enum('type', ['artisan', 'api'])->default('artisan')->after('command');
            $table->string('api_url')->nullable()->after('type');
            $table->enum('api_method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])->default('GET')->after('api_url');
            $table->text('api_headers')->nullable()->after('api_method'); // JSON string
            $table->text('api_body')->nullable()->after('api_headers');   // JSON string
            $table->text('last_response')->nullable()->after('last_run_at');
            $table->boolean('last_success')->nullable()->after('last_response');
        });
    }

    public function down(): void
    {
        Schema::table('cron_jobs', function (Blueprint $table) {
            $table->dropColumn(['type', 'api_url', 'api_method', 'api_headers', 'api_body', 'last_response', 'last_success']);
        });
    }
};
