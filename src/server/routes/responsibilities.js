const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');

const router = express.Router();

// Configure multer for file upload (store in memory)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  }
});

/**
 * @route   GET /api/responsibilities/template
 * @desc    Download Excel template for bulk upload
 * @access  Public
 */
router.get('/template', (req, res) => {
  try {
    const templatePath = path.join(__dirname, '../../../templates/responsibilities_template.csv');
    
    console.log('Template path:', templatePath);
    console.log('File exists:', fs.existsSync(templatePath));
    
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template file not found' });
    }

    res.download(templatePath, 'responsibilities_template.csv', (err) => {
      if (err) {
        console.error('Error downloading template:', err);
        res.status(500).json({ error: 'Failed to download template' });
      }
    });
  } catch (error) {
    console.error('Error serving template:', error);
    res.status(500).json({ error: 'Failed to serve template' });
  }
});

/**
 * @route   POST /api/responsibilities/bulk-upload
 * @desc    Bulk upload responsibilities from Excel/CSV
 * @access  Private
 */
router.post('/bulk-upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse the Excel/CSV file from buffer
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // Excel rows start at 1, header is row 1

      try {
        // Validate required fields
        const title = row['Title'] || row['title'];
        const dateInput = row['Date'] || row['date'];
        let startTime = row['Start Time'] || row['start_time'] || row['startTime'];
        let endTime = row['End Time'] || row['end_time'] || row['endTime'];
        const description = row['Description'] || row['description'] || '';

        console.log(`Row ${rowNumber} raw data:`, { 
          title, 
          dateInput, 
          startTime: startTime, 
          startTimeType: typeof startTime,
          endTime: endTime,
          endTimeType: typeof endTime
        });

        // Convert Excel time numbers to time strings
        const convertExcelTime = (timeValue) => {
          if (typeof timeValue === 'number') {
            // Excel stores time as fraction of a day (0.5 = 12:00 PM)
            const totalMinutes = Math.round(timeValue * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${hours}:${String(minutes).padStart(2, '0')}`;
          }
          return String(timeValue).trim();
        };

        startTime = convertExcelTime(startTime);
        endTime = convertExcelTime(endTime);

        console.log(`Row ${rowNumber} converted times:`, { startTime, endTime });

        if (!title || !dateInput || !startTime || !endTime) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: `Missing required fields. Found: Title=${!!title}, Date=${!!dateInput}, Start Time=${!!startTime}, End Time=${!!endTime}`
          });
          continue;
        }

        // Parse and normalize date - Accept MM/DD/YYYY format and Excel date numbers
        let normalizedDate = null;
        let dateStr = String(dateInput).trim();
        
        console.log(`Row ${rowNumber}: Processing date "${dateStr}" (type: ${typeof dateInput})`);
        
        // Check if it's an Excel serial date number
        if (!isNaN(dateInput) && typeof dateInput === 'number') {
          // Convert Excel serial date to JavaScript Date
          // Excel dates start from 1900-01-01 (serial 1)
          const excelEpoch = new Date(1899, 11, 30); // Excel epoch (Dec 30, 1899)
          const jsDate = new Date(excelEpoch.getTime() + dateInput * 86400000);
          
          const year = jsDate.getFullYear();
          const month = String(jsDate.getMonth() + 1).padStart(2, '0');
          const day = String(jsDate.getDate()).padStart(2, '0');
          
          normalizedDate = `${year}-${month}-${day}`;
          console.log(`  Converted Excel serial date ${dateInput} to: ${normalizedDate}`);
        }
        // Try MM/DD/YYYY, M/DD/YYYY, M/D/YYYY, MM-DD-YYYY, M-DD-YYYY, M-D-YYYY format
        else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(dateStr)) {
          const separator = dateStr.includes('/') ? '/' : '-';
          const parts = dateStr.split(separator);
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          const year = parts[2];
          
          // Validate month and day ranges
          const monthNum = parseInt(parts[0]);
          const dayNum = parseInt(parts[1]);
          
          if (monthNum < 1 || monthNum > 12) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: `Invalid month value: ${monthNum}. Month must be between 1 and 12.`
            });
            continue;
          }
          
          if (dayNum < 1 || dayNum > 31) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: `Invalid day value: ${dayNum}. Day must be between 1 and 31.`
            });
            continue;
          }
          
          normalizedDate = `${year}-${month}-${day}`;
          console.log(`  Parsed as MM${separator}DD${separator}YYYY: ${normalizedDate}`);
        }
        
        if (!normalizedDate) {
          console.log(`  ❌ No format matched for date: "${dateStr}"`);
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: `Invalid date format. Use MM/DD/YYYY or MM-DD-YYYY (e.g., 02/11/2026, 2/11/2026, 12/25/2026). Received: "${dateStr}"`
          });
          continue;
        }
        
        console.log(`  ✅ Normalized date: ${normalizedDate}`);

        // Validate the date is valid
        const dateObj = new Date(normalizedDate);
        if (isNaN(dateObj.getTime())) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: 'Invalid date value. Please check the date is correct.'
          });
          continue;
        }

        // Validate time format (HH:MM or HH:MM:SS, with optional AM/PM)
        // Updated regex to properly handle AM/PM with or without space
        const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM|am|pm))?$/;
        const startTimeStr = String(startTime).trim();
        const endTimeStr = String(endTime).trim();
        
        console.log(`Row ${rowNumber} validating times:`, { 
          startTimeStr, 
          endTimeStr,
          startTimeMatch: timeRegex.test(startTimeStr),
          endTimeMatch: timeRegex.test(endTimeStr)
        });
        
        if (!timeRegex.test(startTimeStr) || !timeRegex.test(endTimeStr)) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: `Invalid time format. Use HH:MM, HH:MM:SS, or 12-hour format with AM/PM (e.g., 9:30, 09:30:00, 9:30 AM, 2:30 PM). Received: Start="${startTimeStr}", End="${endTimeStr}"`
          });
          continue;
        }

        // Normalize time format (convert to 24-hour HH:MM format)
        const normalizeTime = (time) => {
          const timeStr = String(time).trim();
          
          // Check if time has AM/PM
          const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})(:\d{2})?\s*(AM|PM|am|pm)$/i);
          
          if (ampmMatch) {
            // 12-hour format with AM/PM
            let hours = parseInt(ampmMatch[1]);
            const minutes = ampmMatch[2];
            const ampm = ampmMatch[4].toUpperCase();
            
            // Convert to 24-hour format
            if (ampm === 'PM' && hours !== 12) {
              hours += 12;
            } else if (ampm === 'AM' && hours === 12) {
              hours = 0;
            }
            
            return `${String(hours).padStart(2, '0')}:${minutes}`;
          } else {
            // 24-hour format
            const parts = timeStr.split(':');
            const hours = parts[0].padStart(2, '0');
            const minutes = parts[1];
            // Store only HH:MM format (ignore seconds)
            return `${hours}:${minutes}`;
          }
        };

        // Create responsibility
        const taskData = {
          title: String(title).trim(),
          description: String(description).trim(),
          date: normalizedDate,
          startTime: normalizeTime(String(startTime).trim()),
          endTime: normalizeTime(String(endTime).trim()),
          userId: req.user.userId,
          username: req.user.username,
          completed: false,
          createdAt: new Date().toISOString(),
          completedAt: null,
          updatedAt: new Date().toISOString()
        };

        await firestore.collection('tasks').add(taskData);
        results.success++;

      } catch (error) {
        results.failed++;
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Failed to create responsibility'
        });
      }
    }

    // File is automatically deleted from memory after processing
    res.json({
      message: 'Bulk upload completed',
      results: {
        total: data.length,
        success: results.success,
        failed: results.failed,
        errors: results.errors // Return all errors
      }
    });

  } catch (error) {
    console.error('Error processing bulk upload:', error);
    res.status(500).json({ error: 'Failed to process file. Please check the format and try again.' });
  }
});

/**
 * @route   POST /api/responsibilities
 * @desc    Create a new responsibility
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, date, startTime, endTime } = req.body;
    
    if (!title || !date || !startTime || !endTime) {
      return res.status(400).json({ error: 'Title, date, start time, and end time are required' });
    }

    const taskData = {
      title,
      description: description || '',
      date,
      startTime,
      endTime,
      userId: req.user.userId,
      username: req.user.username,
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      updatedAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('tasks').add(taskData);
    
    res.status(201).json({
      message: 'Responsibility created successfully',
      taskId: docRef.id,
      task: { id: docRef.id, ...taskData }
    });
  } catch (error) {
    console.error('Error creating responsibility:', error);
    res.status(500).json({ error: 'Failed to create responsibility' });
  }
});

/**
 * @route   GET /api/responsibilities
 * @desc    Get user's responsibilities
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  console.log('GET /api/responsibilities route hit by user:', req.user.userId);
  try {
    // Use a simpler query without orderBy to avoid index requirement
    const snapshot = await firestore
      .collection('tasks')
      .where('userId', '==', req.user.userId)
      .get();

    const tasks = [];
    snapshot.forEach(doc => {
      tasks.push({
        _id: doc.id,
        ...doc.data()
      });
    });

    // Sort in JavaScript instead of Firestore
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log(`Found ${tasks.length} tasks for user ${req.user.userId}`);
    res.json({ tasks });
  } catch (error) {
    console.error('Error getting responsibilities:', error);
    res.status(500).json({ error: 'Failed to get responsibilities' });
  }
});

/**
 * @route   GET /api/responsibilities/all
 * @desc    Get all responsibilities (community view)
 * @access  Private
 */
router.get('/all', authenticateToken, async (req, res) => {
  console.log('GET /api/responsibilities/all route hit by user:', req.user.userId);
  try {
    // Use a simpler query without orderBy to avoid index requirement
    const snapshot = await firestore
      .collection('tasks')
      .get();

    const tasks = [];
    snapshot.forEach(doc => {
      tasks.push({
        _id: doc.id,
        ...doc.data()
      });
    });

    // Sort in JavaScript instead of Firestore
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log(`Found ${tasks.length} total tasks for community view`);
    res.json({ tasks });
  } catch (error) {
    console.error('Error getting all responsibilities:', error);
    res.status(500).json({ error: 'Failed to get responsibilities' });
  }
});

/**
 * @route   PUT /api/responsibilities/:id
 * @desc    Update responsibility
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, title, description } = req.body;

    const updateData = {
      updatedAt: new Date().toISOString()
    };

    if (completed !== undefined) {
      updateData.completed = completed;
      updateData.completedAt = completed ? new Date().toISOString() : null;
    }

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    await firestore.collection('tasks').doc(id).update(updateData);

    res.json({ message: 'Responsibility updated successfully' });
  } catch (error) {
    console.error('Error updating responsibility:', error);
    res.status(500).json({ error: 'Failed to update responsibility' });
  }
});

/**
 * @route   DELETE /api/responsibilities/:id
 * @desc    Delete responsibility
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ownership
    const doc = await firestore.collection('tasks').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const task = doc.data();
    if (task.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this responsibility' });
    }

    await firestore.collection('tasks').doc(id).delete();

    res.json({ message: 'Responsibility deleted successfully' });
  } catch (error) {
    console.error('Error deleting responsibility:', error);
    res.status(500).json({ error: 'Failed to delete responsibility' });
  }
});

/**
 * @route   GET /api/responsibilities/dates
 * @desc    Get unique dates with task counts
 * @access  Private
 */
router.get('/dates', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.query;
    
    let query = firestore.collection('tasks');
    if (userId && userId !== 'all') {
      query = query.where('userId', '==', userId);
    }

    const snapshot = await query.get();
    const dateMap = new Map();

    snapshot.forEach(doc => {
      const data = doc.data();
      const date = data.date;
      if (dateMap.has(date)) {
        dateMap.set(date, dateMap.get(date) + 1);
      } else {
        dateMap.set(date, 1);
      }
    });

    const dates = Array.from(dateMap.entries()).map(([date, count]) => ({
      date,
      count
    }));

    // Sort dates (newest first)
    dates.sort((a, b) => b.date.localeCompare(a.date));

    res.json({ dates });
  } catch (error) {
    console.error('Error getting task dates:', error);
    res.status(500).json({ error: 'Failed to get task dates' });
  }
});

/**
 * @route   GET /api/responsibilities/stats
 * @desc    Get task statistics for user
 * @access  Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const snapshot = await firestore
      .collection('tasks')
      .where('userId', '==', req.user.userId)
      .get();

    let total = 0;
    let completed = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      total++;
      if (data.completed) completed++;
    });

    const stats = {
      total,
      completed,
      pending: total - completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };

    res.json({ stats });
  } catch (error) {
    console.error('Error getting task statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;