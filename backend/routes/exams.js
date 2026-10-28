const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

function validExam(body) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const duration_minutes = Number(body.duration_minutes);
  const starts_at = body.starts_at || null;
  const ends_at = body.ends_at || null;
  if (title.length < 3 || title.length > 150) throw Object.assign(new Error('Title must be 3–150 characters.'), { status: 400 });
  if (description.length > 2000) throw Object.assign(new Error('Description is too long.'), { status: 400 });
  if (!Number.isInteger(duration_minutes) || duration_minutes < 1 || duration_minutes > 300) throw Object.assign(new Error('Duration must be 1–300 minutes.'), { status: 400 });
  if (starts_at && Number.isNaN(Date.parse(starts_at))) throw Object.assign(new Error('Invalid start date.'), { status: 400 });
  if (ends_at && Number.isNaN(Date.parse(ends_at))) throw Object.assign(new Error('Invalid end date.'), { status: 400 });
  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) throw Object.assign(new Error('End date must be after start date.'), { status: 400 });
  return { title, description, duration_minutes, starts_at, ends_at };
}
async function ownedExam(id, userId) {
  const { data, error } = await supabase.from('exams').select('*').eq('id', id).eq('instructor_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
router.get('/', async (req, res, next) => {
  try {
    let query = supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at,status,created_at,instructor_id').order('created_at', { ascending: false });
    query = req.user.role === 'instructor' ? query.eq('instructor_id', req.user.sub) : query.eq('status', 'published');
    const { data, error } = await query;
    if (error) throw error;
    res.json({ exams: data || [] });
  } catch (err) { next(err); }
});
router.post('/', requireRole('instructor'), async (req, res, next) => {
  try {
    const exam = validExam(req.body);
    const { data, error } = await supabase.from('exams').insert({ ...exam, instructor_id: req.user.sub, status: 'draft' }).select('*').single();
    if (error) throw error;
    res.status(201).json({ message: 'Exam saved as draft.', exam: data });
  } catch (err) { next(err); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const { data: exam, error } = await supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at,status,instructor_id,created_at').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (req.user.role === 'instructor' && exam.instructor_id !== req.user.sub) return res.status(403).json({ error: 'This exam belongs to another instructor.' });
    if (req.user.role === 'student' && exam.status !== 'published') return res.status(404).json({ error: 'Published exam not found.' });
    if (req.user.role === 'student' && exam.starts_at && Date.now() < Date.parse(exam.starts_at)) return res.status(403).json({ error: 'This exam is not available yet.' });
    if (req.user.role === 'student' && exam.ends_at && Date.now() > Date.parse(exam.ends_at)) return res.status(403).json({ error: 'This exam is no longer available.' });
    const { data: questions, error: qError } = await supabase.from('questions').select('*').eq('exam_id', exam.id).order('position');
    if (qError) throw qError;
    const safeQuestions = (questions || []).map(q => req.user.role === 'instructor' ? q : ({ id:q.id, prompt:q.prompt, options:q.options, points:q.points, position:q.position }));
    res.json({ exam: { ...exam, questions: safeQuestions } });
  } catch (err) { next(err); }
});
router.put('/:id', requireRole('instructor'), async (req, res, next) => {
  try {
    const existing = await ownedExam(req.params.id, req.user.sub);
    if (!existing) return res.status(404).json({ error: 'Exam not found.' });
    if (existing.status !== 'draft') return res.status(409).json({ error: 'Move the exam to draft before editing it.' });
    const { data, error } = await supabase.from('exams').update(validExam(req.body)).eq('id', existing.id).select('*').single();
    if (error) throw error;
    res.json({ message: 'Exam updated.', exam: data });
  } catch (err) { next(err); }
});
router.delete('/:id', requireRole('instructor'), async (req, res, next) => {
  try {
    const existing = await ownedExam(req.params.id, req.user.sub);
    if (!existing) return res.status(404).json({ error: 'Exam not found.' });
    if (existing.status !== 'draft') return res.status(409).json({ error: 'Move the exam to draft before deleting it.' });
    const { error } = await supabase.from('exams').delete().eq('id', existing.id);
    if (error) throw error;
    res.json({ message: 'Draft exam deleted.' });
  } catch (err) { next(err); }
});
router.post('/:id/questions', requireRole('instructor'), async (req, res, next) => {
  try {
    const exam = await ownedExam(req.params.id, req.user.sub);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'draft') return res.status(409).json({ error: 'Move the exam to draft before adding questions.' });
    const prompt = String(req.body.prompt || '').trim();
    const options = req.body.options;
    const correct_option = Number(req.body.correct_option);
    const points = Number(req.body.points || 1);
    const position = Number(req.body.position || 0);
    if (prompt.length < 5 || prompt.length > 1000) return res.status(400).json({ error: 'Question must be 5–1000 characters.' });
    if (!Array.isArray(options) || options.length !== 4 || options.some(o => typeof o !== 'string' || !o.trim() || o.length > 300)) return res.status(400).json({ error: 'Provide four non-empty options, each up to 300 characters.' });
    if (!Number.isInteger(correct_option) || correct_option < 0 || correct_option > 3) return res.status(400).json({ error: 'Select a correct option.' });
    if (!Number.isInteger(points) || points < 1 || points > 100) return res.status(400).json({ error: 'Points must be 1–100.' });
    const { data, error } = await supabase.from('questions').insert({ exam_id: exam.id, prompt, options: options.map(o=>o.trim()), correct_option, points, position }).select('*').single();
    if (error) throw error;
    res.status(201).json({ message: 'Question added.', question: data });
  } catch (err) { next(err); }
});
router.patch('/:id/publish', requireRole('instructor'), async (req, res, next) => {
  try {
    const exam = await ownedExam(req.params.id, req.user.sub);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status === 'draft') {
      const { count, error: qError } = await supabase.from('questions').select('id', { count:'exact', head:true }).eq('exam_id', exam.id);
      if (qError) throw qError;
      if (!count) return res.status(400).json({ error: 'Add at least one question before publishing.' });
    }
    const status = exam.status === 'published' ? 'draft' : 'published';
    const { data, error } = await supabase.from('exams').update({ status }).eq('id', exam.id).select('*').single();
    if (error) throw error;
    res.json({ message: status === 'published' ? 'Exam published.' : 'Exam moved to draft.', exam: data });
  } catch (err) { next(err); }
});
module.exports = router;
