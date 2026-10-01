<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Models\TicketReply;
use Illuminate\Http\Request;

class TicketController extends Controller
{
    public function index()
    {
        $tickets = Ticket::with('user')->get();
        return view('admin.tickets.index', compact('tickets'));
    }

    public function show($id)
    {
        $ticket = Ticket::with(['user', 'replies.user', 'replies.admin'])->findOrFail($id);
        return view('admin.tickets.show', compact('ticket'));
    }

    public function reply(Request $request, $id)
    {
        $request->validate([
            'message' => 'required|string',
        ]);

        $ticket = Ticket::findOrFail($id);

        TicketReply::create([
            'ticket_id' => $ticket->id,
            'admin_id' => auth('admin')->id(), // Assuming admin is logged in
            'message' => $request->message,
        ]);

        // Optionally update ticket status to 'pending' or 'closed' based on reply
        if ($ticket->status == 'open') {
            $ticket->status = 'pending';
            $ticket->save();
        }

        return back()->with('success', 'Reply sent!');
    }

    public function close($id)
    {
        $ticket = Ticket::findOrFail($id);
        $ticket->status = 'closed';
        $ticket->save();
        return back()->with('success', 'Ticket closed!');
    }
}