const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/mine', requireRole('student'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('attempts').select('id,exam_id,score,total_points,submitted_at,exams(title)').eq('student_id', req.user.sub).order('submitted_at', { ascending:false });
    if (error) throw error;
    res.json({ attempts: data || [] });
  } catch (err) { next(err); }
});
router.post('/:examId/submit', requireRole('student'), async (req, res, next) => {
  try {
    const { data: exam, error: eError } = await supabase.from('exams').select('id,status,starts_at,ends_at').eq('id', req.params.examId).maybeSingle();
    if (eError) throw eError;
    if (!exam || exam.status !== 'published') return res.status(404).json({ error: 'Published exam not found.' });
    const now = Date.now();
    if (exam.starts_at && now < Date.parse(exam.starts_at)) return res.status(403).json({ error: 'This exam is not available yet.' });
    if (exam.ends_at && now > Date.parse(exam.ends_at)) return res.status(403).json({ error: 'This exam is no longer available.' });
    const { data: questions, error: qError } = await supabase.from('questions').select('id,correct_option,points').eq('exam_id', exam.id);
    if (qError) throw qError;
    if (!questions || !questions.length) return res.status(400).json({ error: 'This exam has no questions.' });
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const answerMap = new Map();
    for (const answer of answers) {
      if (!answer || typeof answer.question_id !== 'string' || !Number.isInteger(Number(answer.selected_option)) || Number(answer.selected_option) < 0 || Number(answer.selected_option) > 3)
        return res.status(400).json({ error: 'One or more submitted answers are invalid.' });
      answerMap.set(answer.question_id, Number(answer.selected_option));
    }
    let score = 0, total_points = 0;
    const rows = [];
    for (const q of questions) {
      total_points += q.points;
      const selected = answerMap.has(q.id) ? answerMap.get(q.id) : null;
      const is_correct = selected !== null && selected === q.correct_option;
      if (is_correct) score += q.points;
      rows.push({ question_id:q.id, selected_option:selected, is_correct });
    }
    const { data: attempt, error: aError } = await supabase.from('attempts').insert({ exam_id:exam.id, student_id:req.user.sub, score, total_points }).select('*').single();
    if (aError) {
      if (aError.code === '23505') return res.status(409).json({ error: 'You have already submitted this exam.' });
      throw aError;
    }
    const answerRows = rows.map(row => ({ ...row, attempt_id:attempt.id }));
    const { error: ansError } = await supabase.from('attempt_answers').insert(answerRows);
    if (ansError) {
      await supabase.from('attempts').delete().eq('id', attempt.id);
      throw ansError;
    }
    res.status(201).json({ message:'Exam submitted successfully.', result:{ id:attempt.id, score, total_points, submitted_at:attempt.submitted_at } });
  } catch (err) { next(err); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const { data: attempt, error } = await supabase.from('attempts').select('*,exams(id,title,instructor_id)').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!attempt) return res.status(404).json({ error: 'Result not found.' });
    const allowed = (req.user.role === 'student' && attempt.student_id === req.user.sub) ||
      (req.user.role === 'instructor' && attempt.exams.instructor_id === req.user.sub);
    if (!allowed) return res.status(403).json({ error: 'You cannot view this result.' });
    const { data: answers, error: ansError } = await supabase.from('attempt_answers').select('id,selected_option,is_correct,questions(id,prompt,options,correct_option,points,position)').eq('attempt_id', attempt.id);
    if (ansError) throw ansError;
    res.json({ result:attempt, answers:answers || [] });
  } catch (err) { next(err); }
});
module.exports = router;
