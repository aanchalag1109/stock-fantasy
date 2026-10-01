const mongoose = require('mongoose');

const sessionTemplateSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  template_name: { type: String, required: true },
  image_url: { type: String, default: null },
  market_type: { type: String, required: true },
  max_stocks: { type: Number, default: 5 },
  user_joining_start_time: { type: Date, default: null },
  start_time: { type: Date, default: null },
  end_time: { type: Date, default: null },
  status: { type: String, default: 'draft' },
  active: { type: Boolean, default: true },
  assets_data: { type: mongoose.Schema.Types.Mixed, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('SessionTemplate', sessionTemplateSchema);
