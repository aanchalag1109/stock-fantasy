<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Contest>
 */
class ContestFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => $this->faker->sentence(3),
            'description' => $this->faker->paragraph(),
            'start_date' => $this->faker->dateTimeBetween('-1 month', '+1 week'),
            'end_date' => $this->faker->dateTimeBetween('+1 week', '+2 months'),
            'entry_fee' => $this->faker->randomFloat(2, 10, 100),
            'prize_pool' => $this->faker->randomFloat(2, 1000, 10000),
            'status' => $this->faker->randomElement(['active', 'upcoming', 'completed']),
        ];
    }
}
